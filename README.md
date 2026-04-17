# Unified Calendar（Webアプリ試作版）

iPhone / Mac / Google Calendar の使い勝手を参考に、
**月スクロール中心 + グループ共有 + 権限分離**を行うカレンダーです。

## 1. 主要機能

- 月表示を縦スクロールでなめらかに切り替え（snap付き）
- 起動時に「今日」が縦方向の中央付近に表示
- 日付セルをタップして即予定追加
- 予定のデフォルト時間は `10:00-11:00`
- 種別は4種類固定（色は自動）
  - 予定（青）
  - 職場（水色）
  - 自宅（オレンジ）
  - その他（グレー）
- 予定タイトルは任意（未入力時は `(無題)`）
- グループ共有 + 権限（admin / editor / viewer）
- BroadcastChannel + storageイベントで、別タブ間の即時反映

## 2. 起動方法

```bash
cd /workspace/Calendar
python3 -m http.server 5173
```

または

```bash
python3 -m http.server 5173 --directory /workspace/Calendar
```

- URL: `http://localhost:5173`

> `Directory listing for /` が出る場合は、`/workspace/Calendar` 以外でサーバーを起動している可能性があります。

## 3. ログイン

### 3-1. デモログイン

起動直後にログインダイアログが開きます。まずは「デモユーザー」で利用できます。

### 3-2. Googleログイン（任意）

`app.js` の以下を設定してください。

```js
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_OAUTH_CLIENT_ID";
```

- Google Cloud Console で OAuth Client ID を作成
- Authorized JavaScript origins に `http://localhost:5173` を追加
- 設定後、ログインダイアログに Google ボタンが表示されます

> 注意: 現在はフロント単体試作のため、IDトークン検証はクライアント側のみです。
> 本番では必ずサーバー側検証を追加してください。

## 4. 使い方

1. **日付セルをクリック** → 予定作成ダイアログが開く
2. タイトルは任意、種別を選んで保存
3. 共有したい場合は「共有先グループ」を選択
4. Admin が招待トークンを発行し、他ユーザーが承認すると参加

## 5. 「切り替えるとグループから弾かれる」問題への対応

- ユーザー情報を `userId` ベースで保持するよう変更し、
  表示名変更・画面切り替えで membership が崩れないようにしました。

## 6. 「Adminの予定がViewerに即時反映されない」問題への対応

- `localStorage` 保存時に `BroadcastChannel` 通知
- `storage` イベントも監視
- 同一ブラウザ内の別タブでも更新が即時反映されます

## 7. ファイル構成

- `index.html` UI本体
- `styles.css` レイアウトと見た目
- `app.js` 状態管理 / ログイン / 予定 / 共有ロジック

