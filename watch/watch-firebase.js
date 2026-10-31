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
  const CONFIRMED_KEY = 'watch-confirmed-state-v1';
  let sdkTask;
  let database, persistenceStarted = false;
  function ensureFirebase() {
    if (typeof firebase !== 'undefined' && firebase.firestore) return Promise.resolve();
    if (!sdkTask) {
      const load = name => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timeout = setTimeout(() => { script.remove(); reject(new Error('接続がタイムアウトしました')); }, 12000);
        script.src = `https://www.gstatic.com/firebasejs/12.19.0/${name}.js`;
        script.onload = () => { clearTimeout(timeout); resolve(); };
        script.onerror = () => { clearTimeout(timeout); reject(new Error('接続できませんでした')); };
        document.head.append(script);
      });
      sdkTask = load('firebase-app-compat').then(() => load('firebase-firestore-compat')).catch(error => { sdkTask = null; throw error; });
    }
    return sdkTask;
  }
  function remember(state) {
    try { localStorage.setItem(CONFIRMED_KEY, JSON.stringify(state)); } catch { /* The online session can continue without a cache. */ }
  }
  window.WatchFirebase = {
    cachedState() {
      try {
        const state = JSON.parse(localStorage.getItem(CONFIRMED_KEY) || 'null');
        return state?.version === 2 && Array.isArray(state.casts) && Array.isArray(state.floors) && state.timers && typeof state.timers === 'object' ? state : null;
      } catch { return null; }
    },
    async readPerformance() {
      await ensureFirebase();
      const snapshot = await firebase.firestore().collection('shared').doc('main').get();
      if (!snapshot.exists || !Array.isArray(snapshot.data()?.state?.members)) throw new Error('管理アプリのデータを読み込めませんでした');
      return snapshot.data().state;
    },
    async savePerformance(memberId, date, deltas) {
      await ensureFirebase();
      const ref = firebase.firestore().collection('shared').doc('main');
      return firebase.firestore().runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        const state = snapshot.data()?.state;
        const member = state?.members?.find(item => String(item.id) === String(memberId));
        if (!member) throw new Error('キャストが見つかりません');
        const allowed = new Set(['nominations', 'freebacks', ...(state.monthlyMetricFields ?? []).map(item => item.id)]);
        member.dailyMetrics ??= {};
        const daily = member.dailyMetrics[date] ??= {};
        for (const [field, delta] of Object.entries(deltas)) {
          if (!allowed.has(field)) throw new Error('項目が変更されています。開き直してください');
          const current = Number(daily[field] || 0);
          const value = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
          if (!Number.isFinite(value)) throw new Error('数値を確認してください');
          daily[field] = String(value);
        }
        transaction.update(ref, { state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        return state;
      });
    },
    async start(store, onRemote) {
      await ensureFirebase();
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      database = firebase.firestore(app);
      if (!persistenceStarted && database.enablePersistence) {
        persistenceStarted = true;
        await database.enablePersistence({ synchronizeTabs: true }).catch(error => console.warn('ローカル保存を利用できません', error));
      }
      const ref = database.collection('shared').doc('watch');
      const local = store.state;
      const first = await ref.get();
      if (first.exists && first.data()?.state?.version === 2) {
        applyingRemote = true;
        store.state = first.data().state;
        remember(store.state);
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
      // The watch runs in its own browser storage, so subscribe to the main
      // roster instead of depending on the management page having been opened.
      firebase.firestore(app).collection('shared').doc('main').onSnapshot(snapshot => {
        const directory = snapshot.data()?.state;
        if (!Array.isArray(directory?.members)) return;
        localStorage.setItem('member-management-v1', JSON.stringify(directory));
        onRemote();
      }, error => console.error('キャスト候補の受信に失敗しました', error));
      ref.onSnapshot(snapshot => {
        if (!snapshot.exists || !ready) return;
        const state = snapshot.data()?.state;
        if (!state || state.version !== 2) return;
        applyingRemote = true;
        store.state = state;
        if (!snapshot.metadata?.hasPendingWrites) remember(state);
        localStorage.setItem('cast-watch-v1', JSON.stringify(state));
        onRemote();
        applyingRemote = false;
      }, error => console.error('ウォッチ共有の受信に失敗しました', error));
    },
  };
})();
