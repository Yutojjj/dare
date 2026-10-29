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
    .watch-debug-header h2 { margin:0; font-size:14px; }
    #watchDebugClose { display:grid; place-items:center; width:40px; height:40px; padding:0; border:1px solid #aab3c1; border-radius:50%; color:#f5f6f9; background:transparent; font-size:28px; line-height:1; cursor:pointer; }
    #watchDebugFrame { display:block; width:100%; flex:1; min-height:0; border:0; background:#090b0f; }
  `;
  document.head.append(style);
  const dialog = document.createElement('dialog');
  dialog.id = 'watchDebugDialog';
  dialog.setAttribute('aria-labelledby', 'watchDebugTitle');
  dialog.innerHTML = '<header class="watch-debug-header"><h2 id="watchDebugTitle">ウォッチ（デバッグ）</h2><button id="watchDebugClose" type="button" aria-label="ウォッチを閉じて戻る" autofocus>×</button></header><iframe id="watchDebugFrame" title="ウォッチ画面"></iframe>';
  document.body.append(dialog);
  const frame = dialog.querySelector('iframe');
  link.addEventListener('click', event => {
    event.preventDefault();
    if (dialog.open) return;
    frame.src = link.href;
    dialog.showModal();
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    frame.removeAttribute('src');
    link.focus();
  });
})();
