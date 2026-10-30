(() => {
  const port = browser.runtime.connectNative('dare_watch_navigation');
  port.onMessage.addListener(message => {
    if (message?.type === 'back') document.dispatchEvent(new Event('dare-watch-back'));
  });
  let previous, previousReady;
  const update = () => {
    const canBack = [...document.querySelectorAll('.timer-dialog-backdrop,#detailScreen,#manageScreen')].some(element => !element.hidden);
    const ready = !document.getElementById('watchBoot');
    if (canBack !== previous || ready !== previousReady) { previous = canBack; previousReady = ready; port.postMessage({ canBack, ready }); }
  };
  const observe = () => {
    new MutationObserver(update).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',observe,{once:true});
  else observe();
})();
