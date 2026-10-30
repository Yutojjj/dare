"""Loopback-only ADB screen mirror. All device input is initiated by a user POST."""
import argparse, json, os, pathlib, subprocess, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = pathlib.Path(__file__).resolve().parent
ADB_CANDIDATES = [pathlib.Path(os.environ.get('LOCALAPPDATA', '')) / 'Temp/DareWatchBuild/sdk/platform-tools/adb.exe', pathlib.Path(os.environ.get('USERPROFILE', '')) / 'OneDrive/デスクトップ/platform-tools/adb.exe']
parser = argparse.ArgumentParser()
parser.add_argument('--adb', default=next((str(p) for p in ADB_CANDIDATES if p.exists()), 'adb'))
parser.add_argument('--port', type=int, default=8766)
args = parser.parse_args()
lock = threading.Lock()
selection_cache = {}

def adb(*command, device=True):
    with lock:
        serial = []
        if device:
            result = subprocess.run([args.adb, 'devices'], capture_output=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            devices = [line.split()[0] for line in result.stdout.decode(errors='replace').splitlines()[1:] if line.strip().endswith('\tdevice')]
            if len(devices) > 1:
                # A single watch may be listed by both IP and its automatic mDNS name.
                key = tuple(devices)
                if key not in selection_cache:
                    identities = []
                    for candidate in devices:
                        identity = subprocess.run([args.adb, '-s', candidate, 'shell', 'getprop', 'ro.serialno'], capture_output=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                        identities.append(identity.stdout.decode(errors='replace').strip() if identity.returncode == 0 else candidate)
                    if len(set(identities)) == 1 and identities[0]:
                        selection_cache[key] = next((item for item in devices if ':' in item), devices[0])
                if key in selection_cache:
                    devices = [selection_cache[key]]
            if len(devices) != 1:
                raise RuntimeError('ウォッチを1台だけADB接続してください。')
            serial = ['-s', devices[0]]
        result = subprocess.run([args.adb, *serial, *command], capture_output=True, timeout=15, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace').strip() or '時計との接続を確認してください。')
        return result.stdout

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *unused): pass
    def reply(self, status, data, content_type='application/json; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if self.headers.get('Host') not in [f'127.0.0.1:{args.port}', f'localhost:{args.port}']:
            self.reply(403, b'{}'); return
        try:
            path = self.path.split('?')[0]
            if path == '/': self.reply(200, (ROOT / 'index.html').read_bytes(), 'text/html; charset=utf-8')
            elif path == '/frame.png':
                png = adb('exec-out', 'screencap', '-p')
                if not png.startswith(b'\x89PNG'): raise RuntimeError('画面を取得できませんでした。')
                self.reply(200, png, 'image/png')
            else: self.reply(404, b'{}')
        except Exception as error:
            self.reply(503, json.dumps({'error': str(error)}, ensure_ascii=False).encode())
    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin not in [f'http://127.0.0.1:{args.port}', f'http://localhost:{args.port}'] or self.headers.get('Content-Type') != 'application/json':
            self.reply(403, b'{}'); return
        try:
            if self.path != '/input': self.reply(404, b'{}'); return
            size = int(self.headers.get('Content-Length', 0))
            if size > 1024: raise ValueError('入力が大きすぎます')
            value = json.loads(self.rfile.read(size))
            action = value.get('action')
            if action == 'wake': adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
            elif action == 'open':
                adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
                adb('shell', 'am', 'start', '-n', 'jp.dare.watch/.MainActivity')
            elif action == 'back': adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
            elif action in ['tap', 'swipe']:
                coordinates = [str(max(0, min(10000, int(value[key])))) for key in (['x', 'y'] if action == 'tap' else ['x', 'y', 'x2', 'y2'])]
                if action == 'swipe': coordinates.append('350')
                adb('shell', 'input', action, *coordinates)
            else: raise ValueError('未対応の操作')
            self.reply(200, b'{"ok":true}')
        except Exception as error:
            self.reply(503, json.dumps({'error': str(error)}, ensure_ascii=False).encode())

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
