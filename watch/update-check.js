(() => {
  // One lightweight check on return; never poll or reload an editing screen.
  const version = document.querySelector('meta[name="watch-ui-version"]')?.content;
  if (!version || location.protocol === 'file:') return;
  let lastCheck = 0, pending = false, checking = false, handle;
  function apply() {
    const home = document.getElementById('homeScreen');
    const face = document.getElementById('watchFace');
    if (!pending || document.hidden || !home || home.hidden || face?.inert) return;
    if ([...document.querySelectorAll('.timer-dialog-backdrop')].some(el => !el.hidden)) return;
    location.reload();
  }
  async function check() {
    if (document.hidden || checking) return;
    if (pending) { apply(); return; }
    if (Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now(); checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(location.pathname, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const latest = html.querySelector('meta[name="watch-ui-version"]')?.content;
      pending = !!latest && latest !== version;
      apply();
    } catch (_) { /* Keep the current screen if offline. */ }
    finally { clearTimeout(timeout); checking = false; }
  }
  function schedule() { clearTimeout(handle); if (!document.hidden) handle = setTimeout(check, 3000); }
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('click', () => { if (pending) setTimeout(apply, 300); });
  new MutationObserver(() => { if (pending) apply(); }).observe(document.getElementById('watchFace'), { subtree: true, attributes: true, attributeFilter: ['hidden', 'inert'] });
  schedule();
})();
