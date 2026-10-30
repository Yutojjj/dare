# HTML遠隔更新の検証状況

目的：Vercelの `/watch/` をAPK同梱のGeckoViewで表示し、画面はWeb公開で更新する。AlarmManager・通知・振動は既存のNativeTimersに残す。

`assembleWebPreview` は標準版と別の `jp.dare.watch.webpreview` を作る。通常の `assembleDebug` は既存のネイティブ版。検証版のActivityは `WebWatchActivity`。ウォッチ4のarmeabi-v7aでビルド成功。検証版は約156MB。

2026-10-31：SM-R860に検証版を追加インストールし、Geckoプロセスの起動を確認。ローカルHTTPページとVercelのHTTPSページは白画面のままで、描画成功は未確認。onLoadErrorの診断コードを追加して再ビルドしたが、その転送中にADB接続がofflineになった。診断版のインストール完了は未確認。接続先は192.168.11.13:44649だった。

その後192.168.11.13:34433に再接続し、診断版のインストール完了。VercelのHTTPSページの実機描画に成功した。起動直後5秒程度では白画面だったが、その後描画された。PC配信のHTML/CSSも同じAPKで表示し、APK再インストールなしで上部ボタン・メンバー行の新レイアウトが反映された（preview-gecko-updated.png）。HTMLからNativeTimersへの連携でnative-timers.xmlのtimers保存も確認した。

実用版として採用済みではない。共有データの卓移動・タイマー開始操作は試していない。実際の通知・振動、スワイプ操作、長時間利用時の電池消費は未確認。公開サイトにnative-bridge.jsを含むソースをまだ公開していないため、既定のVercel URLでは更新前のHTMLが表示される。検証中はlocalhost:8768をADB reverseで接続している。配布用コピーはDareWatch-Web-preview.apk。最初にこの方式のAPKを入れる必要があり、その後は既存のネイティブAPIの範囲内でHTMLを更新できる。

現ビルド環境(SDK36/AGP8.13)では最新Gecko159がSDK37/AGP9.1を要求したため、互換性検証にはGecko146を使用している。本番採用前にはエンジンを現行の保守対象版へ更新し、対応SDK/AGPと実機の安定性を検証する必要がある。

ローカル配信はPCの8768番ポートをadb reverseで時計へ転送していた。`previewUrl` Intent extraは許可したVercelホストと127.0.0.1の `/watch/` のみ受け付ける。公開サイトはまだ変更していない。native-bridge.jsとphone-mode.jsがHTML側の接続部。

2026-10-31 追加確認：Vercelへ画面更新を公開済み。小表示を3人分へ調整し、追加ボタンを下側の黄色い小ボタンへ移動。メンバー操作を全画面モーダル化し、上層だけを戻すスワイプの隔離テスト3件が成功。タイマー・実績の11件も成功。プレビュー接続の4件が成功。旧UIスモーク3件はFirebaseモック不足で起動できず、これらの結果には含めていない。専用のローカル通知ページ（Firebaseには接続しない）からネイティブ通知を1回発火し、delivered=true、vibration=true、OS NotificationRecordの存在および通知権限granted=trueを確認。テストページは削除し、通常のVercel画面へ復帰。振動の体感と長時間の電池持ちは未確認。接続中の時計は192.168.11.12:46649。

2.22：小中大の名前フォントを固定し、省略記号を廃止。長い名前は折り返して行を拡張する。名前のフォント一致・折り返し・重なりなしは隔離ブラウザで確認。Android側とHTML側にアイコン・読み込みバーを追加し、起動時の表示を実機確認。ネイティブのWebExtensionポートで戻る指示を送り、OSのwindowSwipeToDismissを無効にしてアプリ終了との競合を除去。Firebase非接続の専用ページで nativeBack:1 / modal:false、アプリ内の一覧へ戻ったことを実機画像で確認。検証用ページは除去し通常の公開画面へ復帰。接続先192.168.11.12:41157。
