(() => {
  const port = browser.runtime.connectNative('dare_watch_navigation');
  port.onMessage.addListener(message => {
    if (message?.type === 'back') document.dispatchEvent(new Event('dare-watch-back'));
  });
  let previous;
  const update = () => {
    const canBack = [...document.querySelectorAll('.timer-dialog-backdrop,#detailScreen,#manageScreen')].some(element => !element.hidden);
    if (canBack !== previous) { previous = canBack; port.postMessage({ canBack }); }
  };
  const observe = () => {
    new MutationObserver(update).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['hidden']});
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',observe,{once:true});
  else observe();
})();
