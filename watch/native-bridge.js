// Loaded only by the bundled Gecko proof build. The timer alarms remain native.
if (new URLSearchParams(location.search).get('native') === 'gecko') {
  document.body.classList.add('native-web');
  document.getElementById('watchFace').append(document.getElementById('openMemberAddButton'));
  let lastPayload;
  const flush = () => { if (lastPayload) location.href = 'darewatch://sync?payload=' + encodeURIComponent(lastPayload); };
  // Closing the Activity must not cancel a delayed JS timer before the alarm
  // reservation reaches Android. Send immediately and resend at page dismissal.
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
  window.DareWatchNative = Object.freeze({
    ready() { location.href = 'darewatch://ready'; },
    testNotification() { location.href = 'darewatch://test'; },
    requestPermissions() { location.href = 'darewatch://permissions'; },
    syncTimers(raw) {
      const state = JSON.parse(raw);
      // Native notifications and the tile do not need growing movement archives.
      // Keep the URI small even after many days of use.
      const payload = JSON.stringify({
        version: state.version, floors: state.floors, timers: state.timers,
        notificationSettings: state.notificationSettings, dayRolloverTime: state.dayRolloverTime,
        casts: state.casts.map(({id,name,nominatedTableIds,currentTableId,nextTableId,destinationTableId,dayAdded,dayAddedOn,dayAddedAt}) =>
          ({id,name,nominatedTableIds,currentTableId,nextTableId,destinationTableId,dayAdded,dayAddedOn,dayAddedAt})),
      });
      if (payload === lastPayload) return;
      lastPayload = payload;
      flush();
    }
  });
}
