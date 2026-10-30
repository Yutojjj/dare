// Temporary watch preview. Remove this file and its script tag after debugging.
(() => {
  const link = document.getElementById('watchDebugLink');
  if (!link) return;
  link.setAttribute('aria-haspopup', 'dialog');
  const style = document.createElement('style');
  style.textContent = `
    #watchDebugDialog { width:min(620px,calc(100vw - 16px)); height:calc(100dvh - 16px); max-width:none; max-height:none; padding:0; border:1px solid #3b4451; border-radius:0; background:#090b0f; color:#f5f6f9; overflow:hidden; }
    #watchDebugDialog[open] { display:flex; flex-direction:column; }
    #watchDebugDialog::backdrop { background:rgba(0,0,0,.75); }
    .watch-debug-header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex:0 0 auto; padding:8px 12px; border-bottom:1px solid #3b4451; }
    .watch-debug-header h2 { margin:0; font-size:14px; } .watch-debug-modes { display:flex; gap:6px; margin-left:auto; } .watch-debug-modes button { padding:7px 9px; border:1px solid #617285; border-radius:0; background:transparent; color:#f3f5f9; cursor:pointer; } .watch-debug-modes button[aria-pressed="true"] { background:#a9b9ff; color:#090b0f; } .watch-debug-help { font-size:11px; padding:4px 12px; margin:0; color:#a0aebe; }
    #watchDebugClose { display:grid; place-items:center; width:40px; height:40px; padding:0; border:1px solid #aab3c1; border-radius:50%; color:#f5f6f9; background:transparent; font-size:28px; line-height:1; cursor:pointer; }
    #watchDebugFrame { display:block; width:100%; flex:1; min-height:0; border:0; background:#090b0f; }
  `;
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.id = 'watchDebugDialog';
  dialog.setAttribute('aria-labelledby', 'watchDebugTitle');
  dialog.innerHTML = '<header class="watch-debug-header"><h2 id="watchDebugTitle">ウォッチ</h2><div class="watch-debug-modes"><button id="watchDebugNative" type="button" aria-pressed="true">実機</button><button id="watchDebugWeb" type="button" aria-pressed="false">HTML版</button></div><button id="watchDebugClose" type="button" aria-label="ウォッチを閉じて戻る" autofocus>×</button></header><p class="watch-debug-help">実機表示は「watch-android／実機プレビュー」を起動し、時計を接続して使います。</p><iframe id="watchDebugFrame" title="ウォッチ画面"></iframe>';
  document.body.append(dialog);
  const frame = dialog.querySelector('iframe');
  const switchMode = native => { frame.src = native ? 'http://127.0.0.1:8766/' : link.href; dialog.querySelector('#watchDebugNative').setAttribute('aria-pressed', String(native)); dialog.querySelector('#watchDebugWeb').setAttribute('aria-pressed', String(!native)); };
  dialog.querySelector('#watchDebugNative').onclick = () => switchMode(true);
  dialog.querySelector('#watchDebugWeb').onclick = () => switchMode(false);
  link.addEventListener('click', event => {
    event.preventDefault();
    if (dialog.open) return;
    switchMode(true);
    dialog.showModal();
  });
  dialog.querySelector('#watchDebugClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    frame.removeAttribute('src');
    link.focus();
  });
})();

