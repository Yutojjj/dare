(() => {
  const config = {
    apiKey: 'AIzaSyD-Z7gggJZ0fI8mHz1QH993rlXsdwKNkWg',
    authDomain: 'dare-78df9.firebaseapp.com',
    projectId: 'dare-78df9',
    storageBucket: 'dare-78df9.firebasestorage.app',
    messagingSenderId: '590672921816',
    appId: '1:590672921816:web:e3a811470b2460885d43ad',
  };
  let ready = false, applyingRemote = false;
  window.WatchFirebase = {
    async start(store, onRemote) {
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      const ref = firebase.firestore(app).collection('shared').doc('watch');
      const local = store.state;
      const first = await ref.get();
      if (first.exists && first.data()?.state?.version === 2) {
        applyingRemote = true;
        store.state = first.data().state;
        localStorage.setItem('cast-watch-v1', JSON.stringify(store.state));
        onRemote();
        applyingRemote = false;
      } else {
        await ref.set({ state: local, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      const originalSave = store.save;
      store.save = state => {
        const result = originalSave(state);
        if (ready && !applyingRemote) ref.set({ state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(error => console.error('ウォッチ共有保存に失敗しました', error));
        return result;
      };
      ready = true;
      ref.onSnapshot(snapshot => {
        if (!snapshot.exists || !ready) return;
        const state = snapshot.data()?.state;
        if (!state || state.version !== 2) return;
        applyingRemote = true;
        store.state = state;
        localStorage.setItem('cast-watch-v1', JSON.stringify(state));
        onRemote();
        applyingRemote = false;
      }, error => console.error('ウォッチ共有の受信に失敗しました', error));
    },
  };
})();
