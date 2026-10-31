(() => {
  const port = browser.runtime.connectNative('dare_watch_navigation');
  port.onMessage.addListener(message => {
    if (message?.type === 'back') document.dispatchEvent(new Event('dare-watch-back'));
    if (message?.type === 'openCast' && typeof message.castId === 'string') {
      document.documentElement.setAttribute('data-watch-open-cast',message.castId);
      document.dispatchEvent(new Event('dare-watch-open-cast'));
    }
  });
  let previous, previousReady;
  const update = () => {
    const canBack = [...document.querySelectorAll('.timer-dialog-backdrop,#detailScreen,#manageScreen')].some(element => !element.hidden);
    const ready = !document.getElementById('watchBoot');
    if (canBack !== previous || ready !== previousReady) { previous = canBack; previousReady = ready; port.postMessage({ canBack, ready }); }
  };
  const observe = () => {
    new MutationObserver(records => {
      if (!records?.length || records.some(record =>
        (record.type === 'childList' && !previousReady) ||
        (record.type === 'attributes' && record.target.matches('.timer-dialog-backdrop,#detailScreen,#manageScreen')))) update();
    }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',observe,{once:true});
  else observe();
})();
