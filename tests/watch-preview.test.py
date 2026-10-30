import importlib.util, pathlib, sys, threading, unittest, urllib.request, urllib.error, json, types
from unittest.mock import patch
source=pathlib.Path(__file__).parents[1]/'watch-android'/'preview'/'server.py'
with patch.object(sys,'argv',[str(source)]):
    spec=importlib.util.spec_from_file_location('watch_preview',source); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        def fake(*command,**kwargs):
            self.calls.append(command)
            return b'\x89PNG\r\n\x1a\nframe' if command[:2]==('exec-out','screencap') else b''
        self.fake=patch.object(module,'adb',fake);self.fake.start()
        self.server=module.ThreadingHTTPServer(('127.0.0.1',0),module.Handler)
        module.args.port=self.server.server_address[1]
        self.base=f'http://127.0.0.1:{module.args.port}'
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.fake.stop()
    def post(self,value,origin=None):
        req=urllib.request.Request(self.base+'/input',data=json.dumps(value).encode(),headers={'Content-Type':'application/json','Origin':origin or self.base},method='POST')
        return urllib.request.urlopen(req)
    def test_viewer_and_capture_are_reads(self):
        self.assertIn('ウォッチ実機プレビュー',urllib.request.urlopen(self.base).read().decode())
        self.assertTrue(urllib.request.urlopen(self.base+'/frame.png').read().startswith(b'\x89PNG'))
        self.assertEqual(self.calls,[('exec-out','screencap','-p')])
    def test_tap_and_swipe_are_explicit_and_bounded(self):
        self.post({'action':'tap','x':123,'y':150}).close()
        self.post({'action':'swipe','x':100,'y':250,'x2':100,'y2':100}).close()
        self.assertEqual(self.calls,[('shell','input','tap','123','150'),('shell','input','swipe','100','250','100','100','350')])
    def test_external_origin_and_unknown_actions_cannot_control_device(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:self.post({'action':'open'},'https://unrelated.example')
        self.assertEqual(caught.exception.code,403)
        with self.assertRaises(urllib.error.HTTPError):self.post({'action':'shell'})
        self.assertEqual(self.calls,[])

if __name__=='__main__':unittest.main()
