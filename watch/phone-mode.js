(() => {
  if (!location.pathname.endsWith('/phone.html') && new URLSearchParams(location.search).get('native') !== 'gecko') return;
  document.body.classList.add('phone-mode');

  // A rightward edge swipe acts as Back on phones, while the visible controls
  // remain available for users who prefer tapping.
  let startX = 0;
  let startY = 0;
  let tracking = false;

  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = startX <= 28;
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (dx > 12 && dx > Math.abs(dy) * 1.2) event.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', event => {
    if (!tracking || event.changedTouches.length !== 1) return;
    tracking = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (dx < 90 || dx < Math.abs(dy) * 1.25) return;

    const openDialog = [...document.querySelectorAll('.timer-dialog-backdrop')].find(dialog => !dialog.hidden);
    if (openDialog) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    const back = document.getElementById('backButton');
    if (back && !back.hidden) back.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }, { passive: true });

  document.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
})();
