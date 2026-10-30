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
    async readPerformance() {
      const snapshot = await firebase.firestore().collection('shared').doc('main').get();
      if (!snapshot.exists || !Array.isArray(snapshot.data()?.state?.members)) throw new Error('管理アプリのデータを読み込めませんでした');
      return snapshot.data().state;
    },
    async savePerformance(memberId, date, deltas) {
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
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      const ref = firebase.firestore(app).collection('shared').doc('watch');
      const local = store.state;
      // Use the same subscription for the first load and later updates, rather
      // than fetching the entire shared state twice during startup.
      const first = await new Promise((resolve, reject) => {
        let initial = true;
        ref.onSnapshot(snapshot => {
          if (initial) { initial = false; resolve(snapshot); return; }
          if (!snapshot.exists || !ready) return;
          const state = snapshot.data()?.state;
          if (!state || state.version !== 2) return;
          applyingRemote = true;
          try {
            store.state = state;
            localStorage.setItem('cast-watch-v1', JSON.stringify(state));
            onRemote();
          } finally { applyingRemote = false; }
        }, error => { if (initial) { initial = false; reject(error); } else console.error('ウォッチ共有の受信に失敗しました', error); });
      });
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
      // The watch runs in its own browser storage, so subscribe to the main
      // roster instead of depending on the management page having been opened.
      firebase.firestore(app).collection('shared').doc('main').onSnapshot(snapshot => {
        const directory = snapshot.data()?.state;
        if (!Array.isArray(directory?.members)) return;
        localStorage.setItem('member-management-v1', JSON.stringify(directory));
        onRemote();
      }, error => console.error('キャスト候補の受信に失敗しました', error));
    },
  };
})();
