// Loaded only by the bundled Gecko proof build. The timer alarms remain native.
if (new URLSearchParams(location.search).get('native') === 'gecko') {
  document.body.classList.add('native-web');
  let pending;
  let task;
  window.DareWatchNative = Object.freeze({
    testNotification() { location.href = 'darewatch://test'; },
    requestPermissions() { location.href = 'darewatch://permissions'; },
    syncTimers(raw) {
      pending = raw;
      clearTimeout(task);
      task = setTimeout(() => {
        location.href = 'darewatch://sync?payload=' + encodeURIComponent(pending);
      }, 100);
    }
  });
}
