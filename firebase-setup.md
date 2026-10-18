# Vercel公開とFirebase接続

アプリはVercelで公開し、Firebaseは匿名認証とFirestoreのデータ保存に使います。Firebaseプロジェクト `dare-78df9` の設定はアプリに反映済みです。画面上でIDやパスワードを入力する必要はありません。

## Firebase側の準備

1. Firebaseコンソールで `dare-78df9` を開き、Authentication の「ログイン方法」で「匿名」を有効にします。
2. Firestore Databaseを作成します。本番用モードを選びます。
3. Firestoreの「ルール」に `firestore.rules` の内容を入れて公開します。すでに同じ内容を公開済みなら再設定は不要です。
4. Vercelで公開した後、Firebase Authentication の承認済みドメインに `your-project.vercel.app` のドメインを追加します。独自ドメインを使う場合も追加してください。

## Vercelへ公開

このフォルダーをVercelへデプロイします。Vercel CLIを使う場合、フォルダー内で次を実行し、初回の質問では新規プロジェクトとして設定します。

```sh
npx vercel --prod
```

`vercel.json` がトップページを `dare.html` に転送し、Service Workerの更新をブラウザーが確認するようにします。公開後はVercelが表示する `https://...vercel.app` のURLを開いてください。HTTPSで開くと、PWAとしてインストールできます。Chrome/Edgeはアドレスバーまたはメニューの「インストール」、iPhone/iPadはSafariの共有メニューから「ホーム画面に追加」を選びます。`file://` から直接開いた場合はFirebase認証・PWAインストールが使えず、端末内保存で動作します。

Web App Manifest、Service Worker、192/512ピクセルのアイコン、マスク可能アイコン、Appleホーム画面アイコンを追加済みです。Service Workerはアプリ本体とアイコンだけをキャッシュし、Firebaseの通信はキャッシュしません。オフライン中は画面を開いて端末内に保存できます。オンラインに戻ると未同期の変更をFirebaseへ送ります。

Firestoreルールをコマンドから公開する場合はFirebase CLIでプロジェクト `dare-78df9` にログインした後、次を実行します。

```sh
firebase deploy --only firestore:rules
```

## データの扱い

現在はブラウザーごとに匿名アカウントを作成します。画面にIDは表示されません。同じブラウザーではデータが引き継がれますが、友達が別の端末やブラウザーから開くと別のデータ領域になります。複数端末で同じデータを共有する場合は、共有方式を別途設定する必要があります。

ブラウザーのデータを消去すると匿名アカウントへの結び付きも失われる場合があります。定期的にアプリのデータをエクスポートしてください。
