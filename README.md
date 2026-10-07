# AnyPASS リセール監視（Playwright）

`https://store.anypass.jp/resale-list` を headless Playwright で定期的に検索する
Node.js CLI です。指定条件に一致するチケットが見つかると、詳細 URL と一覧の
スクリーンショットを保存し、詳細ページを開いて終了します。購入・決済・購入確定の
操作は行いません。

## 必要環境

- Node.js 20 以上
- Chromium を起動できる環境

## セットアップ

```powershell
npm install
npm run setup-browser
Copy-Item config.example.json config.json
```

`config.json` を編集して監視条件を設定します。少なくとも `free_word`、`p_date`、
`num_of_ticket` のいずれか一つが必要です。条件なしで最初の出品を検出する事故を
避けるため、空の条件では起動しません。

```json
{
  "free_word": "アーティスト名またはツアー名",
  "p_date": "2026/10/15",
  "num_of_ticket": 2,
  "reload_time": 10,
  "headless": true,
  "open_match_page": true,
  "user_data_dir": ".anypass-profile",
  "screenshot_dir": "output/playwright"
}
```

| 設定 | 内容 |
| --- | --- |
| `free_word` | サイトのフリーワード検索に入力する文字列。空欄可。 |
| `p_date` | 一覧に表示される公演日。空白・全角数字を無視して部分一致で照合。 |
| `num_of_ticket` | 希望枚数。結果の「× N枚」と完全一致で照合。3 以上ではサイト側の「3枚以上」フィルターを使用。 |
| `reload_time` | 未検出時の再検索間隔（秒）。最低 3 秒、既定 10 秒。 |
| `headless` | `true` で画面を表示せずに実行。 |
| `open_match_page` | 一致時に詳細ページへ移動するか。移動後も購入操作はしない。 |
| `user_data_dir` | Cookie・ログイン状態を保存する Chromium プロファイルのパス。 |
| `screenshot_dir` | 一致時に一覧を保存するディレクトリ。 |

## 実行

監視を開始します。

```powershell
npm start -- --config config.json
```

1 回だけ検索して終了する場合は `--once` を付けます。

```powershell
npm start -- --config config.json --once
```

ログイン状態が必要な場合や初回の確認時は、ブラウザを表示して起動します。ログイン後の
状態は `user_data_dir` に保存され、次回以降の headless 実行でも使われます。

```powershell
npm start -- --config config.json --headed --once
```

停止は `Ctrl+C` です。プロファイル、設定ファイル、検出時のスクリーンショットは
Git 管理から除外されています。

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
