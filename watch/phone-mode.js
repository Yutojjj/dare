(() => {
  if (!location.pathname.endsWith('/phone.html') && !document.body.classList.contains('native-web') && new URLSearchParams(location.search).get('native') !== 'gecko') return;
  document.body.classList.add('phone-mode');

  // A rightward edge swipe acts as Back on phones, while the visible controls
  // remain available for users who prefer tapping.
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let surface = null;
  let dragged = false;
  const topDialog = () => [...document.querySelectorAll('.timer-dialog-backdrop')]
    .filter(dialog => !dialog.hidden)
    .sort((a,b) => (parseInt(getComputedStyle(b).zIndex)||0)-(parseInt(getComputedStyle(a).zIndex)||0))[0];
  const clearDrag = () => { if(surface){surface.style.transform='';surface.style.transition='';} surface=null; dragged=false; };

  document.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = startX <= innerWidth * .55;
    surface = topDialog() || [...document.querySelectorAll('#detailScreen,#manageScreen')].find(screen => !screen.hidden) || null;
    tracking = tracking && !!surface;
    dragged = false;
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (dx > 12 && dx > Math.abs(dy) * 1.2) {
      event.preventDefault(); dragged=true;
      surface.style.transition='none'; surface.style.transform=`translateX(${Math.max(0,dx)}px)`;
    }
  }, { passive: false });

  document.addEventListener('touchend', event => {
    if (!tracking || event.changedTouches.length !== 1) return;
    tracking = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if(!dragged){clearDrag();return;}
    event.preventDefault();
    const dismiss=dx>=Math.min(90,innerWidth*.3)&&dx>Math.abs(dy)*1.25;
    surface.style.transition='transform 180ms ease-out';
    surface.style.transform=dismiss?`translateX(${innerWidth}px)`:'translateX(0)';
    setTimeout(() => {
      if(dismiss){
        const openDialog=topDialog();
        if(openDialog) openDialog.querySelector('.timer-dialog-close')?.click();
        else document.getElementById('backButton')?.click();
      }
      clearDrag();
    },180);
  }, { passive: false });

  document.addEventListener('touchcancel', () => { tracking = false; clearDrag(); }, { passive: true });
})();
