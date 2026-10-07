# AnyPASS リセール監視（Electron + Playwright）

`https://store.anypass.jp/resale-list` を Playwright で定期的に検索する
Node.js アプリです。Electron デスクトップ GUI と CLI に対応しています。GUI は右側に
AnyPASS のネイティブ WebView を内包し、検索・ログイン・一致後の詳細画面・3D セキュアを
同じウィンドウで確認できます。指定条件に一致するチケットが見つかると、詳細 URL と一覧の
スクリーンショットを保存し、詳細ページを開いて終了します。任意でログイン、購入手続き、
決済情報の入力と「確認」ボタンの押下までを自動化できます。3D セキュア認証と購入確定は
利用者が GUI 内の画面で行います。

## 必要環境

- Node.js 20 以上
- GUI は Electron を実行できる環境
- CLI も使う場合は Playwright 用 Chromium

## セットアップ

```powershell
npm install
Copy-Item config.example.json config.json
```

CLI も利用する場合だけ、追加で Chromium をインストールします。

```powershell
npm run setup-browser
```

`config.json` を編集して監視条件を設定します。少なくとも `free_word`、`p_date`、
`p_date_from`、`p_date_to`、`num_of_ticket`、`max_price_per_ticket` のいずれか一つが必要です。条件なしで最初の出品を検出する事故を
避けるため、空の条件では起動しません。

```json
{
  "free_word": "アーティスト名またはツアー名",
  "p_date_from": "2026/10/01",
  "p_date_to": "2026/10/31",
  "num_of_ticket": 2,
  "max_price_per_ticket": 12000,
  "reload_time": 10,
  "headless": true,
  "open_match_page": true,
  "auto_purchase": false,
  "auth": {
    "email": "your-email@example.com",
    "password": "your-password"
  },
  "credit_card": {
    "number": "4111111111111111",
    "expiration_month": "12",
    "expiration_year": "2028",
    "cvv": "123"
  },
  "user_data_dir": ".anypass-profile",
  "screenshot_dir": "output/playwright"
}
```

| 設定 | 内容 |
| --- | --- |
| `free_word` | サイトのフリーワード検索に入力する文字列。空欄可。 |
| `p_date` | 一覧に表示される単一の公演日。空白・全角数字を無視して部分一致で照合。日付範囲とは併用不可。 |
| `p_date_from` | 公演日の範囲の開始日（含む）。`YYYY/MM/DD` または `YYYY-MM-DD` 形式。単独指定も可。 |
| `p_date_to` | 公演日の範囲の終了日（含む）。`YYYY/MM/DD` または `YYYY-MM-DD` 形式。単独指定も可。開始日と終了日の両方を指定する場合、開始日は終了日以前にする必要があります。`p_date` とは併用不可。 |
| `num_of_ticket` | 希望枚数。結果の「× N枚」と完全一致で照合し、購入詳細画面の枚数プルダウンにも設定する。`auto_purchase: true` では必須。3 以上ではサイト側の「3枚以上」フィルターを使用。 |
| `max_price_per_ticket` | 1 枚当たりの予算上限（円）。任意の正の整数を指定でき、検出対象は一覧の「¥N/1枚」がこの金額以下のものだけになります。サイトの金額選択肢にない金額は、直上の選択肢で事前に絞り込んだうえで、プログラム側で厳密に除外します。`budget` も互換名として利用できます。 |
| `reload_time` | 未検出時の再検索間隔（秒）。最低 0.1 秒、既定 10 秒。 |
| `headless` | `true` で画面を表示せずに実行。 |
| `open_match_page` | 一致時に詳細ページへ移動するか。`auto_purchase` が `true` の場合は `true` が必須。 |
| `auto_purchase` | `true` の場合、検出したチケットの購入手続きを進め、決済情報を入力する。既定は `false`。 |
| `auth.email` / `auth.password` | 実行時ログインに使う AnyPASS アカウント。`auto_purchase: true` では必須。 |
| `credit_card.number` | カード番号（数字のみ。空白・ハイフンは設定しても除去される）。`auto_purchase: true` では必須。 |
| `credit_card.expiration_month` / `credit_card.expiration_year` | 有効期限。月は `01`〜`12`、年は 2 桁または 4 桁。 |
| `credit_card.cvv` | セキュリティコード（3 桁）。`auto_purchase: true` では必須。 |
| `user_data_dir` | Cookie・ログイン状態を保存する Chromium プロファイルのパス。 |
| `screenshot_dir` | 一致時に一覧を保存するディレクトリ。 |

## 実行

### デスクトップ GUI（推奨）

次のコマンドでデスクトップアプリを開きます。左側で検索条件の保存、監視の開始・停止、
実行ログの確認ができ、右側のネイティブ WebView には Playwright が実際に操作する
AnyPASS の画面が表示されます。停止後も表示中のページは閉じないため、ログイン状態や
検出したチケットを確認できます。

```powershell
npm run gui
```

設定済みのパスワード・カード情報は画面に読み戻さないため、変更が必要な場合だけ入力してください。

別の設定ファイルを使う場合は、次のように指定します。

```powershell
npm run gui -- --config config.json
```

GUI では `headless` の設定にかかわらず、ブラウザをアプリ内へ表示します。Cookie とログイン
状態は Electron のローカルプロファイルに保存されます。右側の「リセール一覧を表示」から、
監視を始める前に手動ログインや表示確認を行えます。

以前のローカル HTTP GUI が必要な場合は、互換用コマンドを使えます。

```powershell
npm run web-gui -- --config config.json
```

### CLI

監視を開始します。

```powershell
npm start -- --config config.json
```

1 回だけ検索して終了する場合は `--once` を付けます。

```powershell
npm start -- --config config.json --once
```

ログイン状態が必要な場合や初回の確認時は、別ウィンドウのブラウザを表示して起動します。
ログイン後の状態は `user_data_dir` に保存され、次回以降の headless 実行でも使われます。

```powershell
npm start -- --config config.json --headed --once
```

停止は `Ctrl+C` です。プロファイル、設定ファイル、検出時のスクリーンショットは
Git 管理から除外されています。

## 購入手続きの自動化

`config.json` に認証情報とカード情報を設定し、`auto_purchase` を `true` にします。
`config.json` は Git 管理から除外済みです。カード番号、CVV、パスワードをログや
スクリーンショットのファイル名に出力することはありません。

購入手続きが始まると、`headless: true` の設定でもブラウザを強制的に表示します。
カード情報を入力後、「確認 / Confirmation」ボタンを自動で押して 3D セキュアを開始します。
以後は GUI 内に表示中のブラウザで認証を利用者自身が完了してください。3D セキュアの認証操作・
購入確定は自動実行しません。3D セキュアが別ウィンドウで開く場合も、Electron 内で表示されます。

購入詳細に枚数プルダウンが 1 つだけある場合、`num_of_ticket` と同じ値を選択してから
購入手続きへ進みます。希望枚数が選択肢にない場合や、プルダウンが複数ある場合は、
誤った枚数で進めないように停止します。

## 検証

```powershell
npm test
```

テストは表示文字列の正規化、枚数の抽出、設定値の検証を確認します。実サイトの検索は
`--once` で実行できます。

## 注意

- 実サイトの利用規約と自動アクセスに関するルールを確認してから利用してください。
- 検索間隔を極端に短く設定しないでください。
- サイトの UI が変わった場合は、`src/index.js` のフォーム・一覧セレクタを見直してください。

旧 Chrome 拡張機能のソースは履歴互換のため残していますが、通常の利用はこの Playwright
CLI を対象にしています。
