# AnyPass 出品チケット監視 拡張機能

`https://store.anypass.jp/resale-list` を監視し、設定した条件のチケットが
出品されたら自動でリンクをクリック(遷移)するChrome拡張機能です。
決済・購入確定などの操作は行いません(該当チケットへのリンククリックまで)。

## ⚠️ 重要な前提

サイトの `robots.txt` が自動アクセスを制限しているため、実際のHTML構造を
事前に確認できていません。`content.js` 冒頭の `SELECTORS` は仮の値です。
**必ず動作確認・調整を行ってから使用してください。**

## スマートフォンでのインストールについて

**結論から言うと、標準のChrome(Android版・iOS版)では、この拡張機能はインストールできません。**

- **Android版Chrome**: 2026年現在、Android版ChromeはChromeウェブストアの拡張機能にも、
  今回のような「パッケージ化されていない拡張機能」の読み込みにも対応していません。
  `chrome://extensions` 相当の管理画面自体がありません。
- **iPhone/iPad版Chrome・Safari**: iOS版ブラウザの拡張機能は「Safari Web Extension」という
  別形式です。今回作成したChrome拡張機能(Manifest V3)をそのまま使うことはできず、
  Xcodeでの変換作業が別途必要になります。現実的な選択肢ではありません。

### Androidで動かしたい場合の代替策

Chromium系だが拡張機能の開発者読み込みに対応したブラウザを使うと、PCに近い手順で
動作させられる場合があります(2026年時点の代表例。将来的に対応状況が変わる可能性があります)。

- **Kiwi Browser**: デベロッパーモードから「パッケージ化されていない拡張機能を読み込む」に
  相当する機能があり、フォルダ(またはzip化したもの)をスマホ内にコピーして読み込めます。
- **Yandex Browser (Android版)** なども拡張機能対応を謳っている場合があります。

いずれもGoogle公式のChromeではなく、Chromiumベースのサードパーティ製ブラウザです。
導入する場合は、開発元・提供元の信頼性をご自身でご確認のうえ利用してください。

大まかな手順(Kiwi Browserの例):

1. Kiwi BrowserをGoogle Playからインストール
2. このフォルダ(`anypass-ticket-watcher`)をスマホ内のストレージにコピー
   (PCからケーブル転送、クラウドストレージ経由でダウンロード、zip化してファイルアプリで展開、など)
3. Kiwi Browserのメニュー →「Extensions」を開く
4. 右下の「+」→「パッケージ化されていない拡張機能を読み込む(Load unpacked)」を選択
5. コピーした `anypass-ticket-watcher` フォルダを選択

### 現実的なおすすめ

チケットの監視・自動遷移という用途の特性上、**PC版Chromeでの利用を基本とする**ことを
おすすめします。外出先で使いたい場合は、PCを起動したまま自宅等に置いておき、
リモートデスクトップ(Chromeリモートデスクトップ等)でスマホからPCを操作する方法が
最も安定して動作します。

## インストール方法(PC)

1. `chrome://extensions` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このフォルダ(`anypass-ticket-watcher`)を選択

## セレクタの調整方法

1. 対象ページ (`store.anypass.jp/resale-list`) を開く
2. 調べたい要素(例:「チケット絞り込み」ボタン)を右クリック →「検証」
3. DevToolsで該当要素を選択し、`id` / `class` / `name` などの
   ユニークに特定できる属性を確認する
4. `content.js` の `SELECTORS` オブジェクトの該当項目を、確認した
   セレクタに書き換える

調整が必要な項目:

| キー | 説明 | 状態 |
|---|---|---|
| `filterOpenButton` | 「チケット絞り込み」ボタン | ✅ 判明済み: `#js-ticket__filler` |
| `freeWordInput` | フリーワード入力欄 | ✅ 判明済み: `input[name="free_word"]` |
| `excludeInProgressCheckbox` | 「購入手続き中は除く」チェックボックス | ✅ 判明済み: `input[name="resale_item_not_being_purchased"]` |
| `searchSubmitButton` / `searchSubmitButtonText` | 検索実行ボタン(class + テキストで特定) | ✅ 判明済み: `button[type="submit"].button__element.inverted` + テキスト「検索」 |
| `ticketItem` | チケット一覧の各アイテム(`<a>`タグ自体がリンク) | ✅ 判明済み: `a.item.resale-list-item` |
| `ticketDate` | アイテム内の公演日表示 | ✅ 判明済み: `p.date span[wovn-ignore]` |
| `ticketNum` | アイテム内の枚数表示 | ✅ 判明済み: `span.ticket-info span[wovn-ignore]` |
| `ticketLink` | (不要) `ticketItem` 自体が `<a>` タグのためクリック対象は `ticketItem` そのもの |

検索ボタンをクリックした後、ページ遷移ではなく **同一ページ内でAJAX的に
一覧が更新される** サイト構造だった場合は、`content.js` の `main()` 内、
コメントアウトされている以下の2行を有効化してください。

```js
// await sleep(1000);
// await checkTicketsAndAct(config);
```

## 設定方法

拡張機能アイコンをクリックすると設定画面が開きます。

- **free_word**: 検索フリーワード
- **p_date**: 公演日(一覧の表記に合わせて入力。部分一致で判定します)
- **num_of_ticket**: 購入枚数(部分一致で判定します)
- **reload_time**: リロード間隔(秒)。未入力の場合は自動的に4秒になります

## 動作の流れ

1. 検索条件が未適用の場合、「絞り込み」ボタン→フリーワード入力→
   「購入手続き中は除く」ON→検索ボタンクリック、を自動実行
2. 一覧を確認し、チケットが0件、または `p_date` / `num_of_ticket` に
   一致するものがなければ、`reload_time` 秒後にページを再読み込み
3. 条件に一致するチケットが見つかったら、そのチケットのリンクをクリック
   (購入確定操作は行わないため、その後は手動で操作してください)

画面右下に現在の状態を表示する小さなオーバーレイが出るので、
動作確認・デバッグに利用できます。

## 利用にあたっての注意

- 本拡張機能はサイトの利用規約に違反しない範囲でご利用ください。
  自動アクセス・bot行為を禁止している場合があります。
- `reload_time` を極端に短く設定すると、サーバーへの負荷やアクセス制限
  (アカウント停止等)につながる可能性があります。常識的な間隔での利用を
  推奨します。
- サイトのUI変更によりセレクタが合わなくなった場合は、都度DevToolsで
  再調整してください。