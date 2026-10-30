# HTML遠隔更新の検証状況

目的：Vercelの `/watch/` をAPK同梱のGeckoViewで表示し、画面はWeb公開で更新する。AlarmManager・通知・振動は既存のNativeTimersに残す。

`assembleWebPreview` は標準版と別の `jp.dare.watch.webpreview` を作る。通常の `assembleDebug` は既存のネイティブ版。検証版のActivityは `WebWatchActivity`。ウォッチ4のarmeabi-v7aでビルド成功。検証版は約156MB。

2026-10-31：SM-R860に検証版を追加インストールし、Geckoプロセスの起動を確認。ローカルHTTPページとVercelのHTTPSページは白画面のままで、描画成功は未確認。onLoadErrorの診断コードを追加して再ビルドしたが、その転送中にADB接続がofflineになった。診断版のインストール完了は未確認。接続先は192.168.11.13:44649だった。

その後192.168.11.13:34433に再接続し、診断版のインストール完了。VercelのHTTPSページの実機描画に成功した。起動直後5秒程度では白画面だったが、その後描画された。PC配信のHTML/CSSも同じAPKで表示し、APK再インストールなしで上部ボタン・メンバー行の新レイアウトが反映された（preview-gecko-updated.png）。HTMLからNativeTimersへの連携でnative-timers.xmlのtimers保存も確認した。

実用版として採用済みではない。共有データの卓移動・タイマー開始操作は試していない。実際の通知・振動、スワイプ操作、長時間利用時の電池消費は未確認。公開サイトにnative-bridge.jsを含むソースをまだ公開していないため、既定のVercel URLでは更新前のHTMLが表示される。検証中はlocalhost:8768をADB reverseで接続している。配布用コピーはDareWatch-Web-preview.apk。最初にこの方式のAPKを入れる必要があり、その後は既存のネイティブAPIの範囲内でHTMLを更新できる。

現ビルド環境(SDK36/AGP8.13)では最新Gecko159がSDK37/AGP9.1を要求したため、互換性検証にはGecko146を使用している。本番採用前にはエンジンを現行の保守対象版へ更新し、対応SDK/AGPと実機の安定性を検証する必要がある。

ローカル配信はPCの8768番ポートをadb reverseで時計へ転送していた。`previewUrl` Intent extraは許可したVercelホストと127.0.0.1の `/watch/` のみ受け付ける。公開サイトはまだ変更していない。native-bridge.jsとphone-mode.jsがHTML側の接続部。
