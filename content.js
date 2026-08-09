// ============================================================================
// AnyPass 出品チケット監視 - content script
// ============================================================================
// ★★★ 重要 ★★★
// robots.txt の制限により実際のページHTMLを事前確認できていません。
// 下記 SELECTORS は一般的な構造を想定した仮の値です。
// 実際に使用する前に、対象ページを開いて DevTools (F12 → 「検証」) で
// 各要素を調べ、実物のセレクタに書き換えてください。
// ============================================================================

const SELECTORS = {
  // 画面上の「チケット絞り込み」ボタン(検索条件パネルを開くボタン)
  filterOpenButton: '#js-ticket__filler',

  // フリーワード入力欄
  freeWordInput: 'input[name="free_word"]',

  // 「購入手続き中は除く」チェックボックス
  excludeInProgressCheckbox: 'input[name="resale_item_not_being_purchased"]',

  // 検索(絞り込み確定)実行ボタン
  // name/idがなく button[type] + class のみのため、classで絞り込む。
  // 同じclassを他のボタン(キャンセル等)が共有している可能性があるため、
  // findSearchSubmitButton() 内でテキスト内容による確認も行っている。
  searchSubmitButton: 'button[type="submit"].button__element.inverted',
  // ボタンのテキストに含まれる文言(誤検出防止用の確認文字列)
  searchSubmitButtonText: '検索',

  // チケット一覧の各アイテム(繰り返し要素)。
  // このタグ自体が <a> であり、クリックすると詳細/購入ページへ遷移する。
  ticketItem: 'a.item.resale-list-item',

  // アイテム内: 公演日を表示する要素(ticketItem からの相対セレクタ)
  // <p class="date"><span wovn-ignore>日付</span></p>
  ticketDate: 'p.date span[wovn-ignore]',

  // アイテム内: 枚数を表示する要素(ticketItem からの相対セレクタ)
  // <span class="ticket-info"><span wovn-ignore>枚数</span></span>
  ticketNum: 'span.ticket-info span[wovn-ignore]',
};

const STORAGE_KEY = 'apw_config';
const APPLIED_FLAG_KEY = 'apw_search_applied'; // sessionStorage: リロードをまたいで保持される
const DEFAULT_RELOAD_SEC = 4;
const ELEMENT_WAIT_TIMEOUT_MS = 8000;
const RESULT_WAIT_TIMEOUT_MS = 6000;

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function log(...args) {
  console.log('[AnyPass Watcher]', ...args);
}

function warn(...args) {
  console.warn('[AnyPass Watcher]', ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text) {
  return (text || '')
    .replace(/\s+/g, '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角数字→半角
    .trim();
}

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const config = result[STORAGE_KEY] || {};
      resolve({
        free_word: (config.free_word || '').trim(),
        p_date: (config.p_date || '').trim(),
        num_of_ticket: (config.num_of_ticket || '').toString().trim(),
        reload_time: (config.reload_time || '').toString().trim(),
      });
    });
  });
}

// 要素が出現するまで待つ(MutationObserver + タイムアウト)
function waitForElement(selector, timeoutMs = ELEMENT_WAIT_TIMEOUT_MS, root = document) {
  return new Promise((resolve) => {
    const existing = root.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = root.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(root === document ? document.body : root, {
      childList: true,
      subtree: true,
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

// 任意の条件関数(finderFn)がtruthyな要素を返すまで待つ汎用版
// (単純なCSSセレクタだけでは一意に特定できない要素向け)
function waitForCondition(finderFn, timeoutMs = ELEMENT_WAIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const existing = finderFn();
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = finderFn();
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

// 「検索」ボタンをclass + テキスト内容で特定する
// (同一classを持つ他ボタンと誤認しないための対策)
function findSearchSubmitButton() {
  const candidates = Array.from(
    document.querySelectorAll(SELECTORS.searchSubmitButton)
  );

  if (candidates.length === 0) return null;

  // テキストが一致するものを優先
  const textMatch = candidates.find((btn) =>
    btn.textContent.trim().includes(SELECTORS.searchSubmitButtonText)
  );
  if (textMatch) return textMatch;

  // 見つからない場合は最初の候補を使い、警告を出す
  if (candidates.length > 0) {
    warn(
      `検索ボタンをテキスト「${SELECTORS.searchSubmitButtonText}」で特定できなかったため、` +
      `class一致の最初の候補(${candidates.length}件中1件目)を使用します。誤動作の場合は要確認。`
    );
    return candidates[0];
  }

  return null;
}

// ステータス表示用のオーバーレイ(動作確認・デバッグ用)
function ensureStatusOverlay() {
  let el = document.getElementById('apw-status-overlay');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'apw-status-overlay';
  el.style.cssText = [
    'position:fixed',
    'right:12px',
    'bottom:12px',
    'z-index:2147483647',
    'background:rgba(17,24,39,0.9)',
    'color:#fff',
    'font-size:12px',
    'line-height:1.5',
    'padding:8px 12px',
    'border-radius:8px',
    'max-width:280px',
    'font-family:sans-serif',
    'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
  ].join(';');
  document.documentElement.appendChild(el);
  return el;
}

function showStatus(text) {
  const el = ensureStatusOverlay();
  const time = new Date().toLocaleTimeString('ja-JP');
  el.textContent = `[監視中 ${time}] ${text}`;
  log(text);
}

// ---------------------------------------------------------------------------
// 検索条件の適用
// ---------------------------------------------------------------------------

async function applySearchFilter(config) {
  showStatus('検索条件を設定しています…');

  const filterButton = await waitForElement(SELECTORS.filterOpenButton);
  if (!filterButton) {
    warn('絞り込みボタンが見つかりません。SELECTORS.filterOpenButton を見直してください。');
    return false;
  }
  filterButton.click();

  const freeWordInput = await waitForElement(SELECTORS.freeWordInput);
  if (!freeWordInput) {
    warn('フリーワード入力欄が見つかりません。SELECTORS.freeWordInput を見直してください。');
    return false;
  }
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  nativeSetter.call(freeWordInput, config.free_word || '');
  freeWordInput.dispatchEvent(new Event('input', { bubbles: true }));
  freeWordInput.dispatchEvent(new Event('change', { bubbles: true }));

  const excludeCheckbox = await waitForElement(SELECTORS.excludeInProgressCheckbox);
  if (!excludeCheckbox) {
    warn('「購入手続き中は除く」チェックボックスが見つかりません。SELECTORS.excludeInProgressCheckbox を見直してください。');
    return false;
  }
  if (!excludeCheckbox.checked) {
    excludeCheckbox.click();
  }

  const submitButton = await waitForCondition(findSearchSubmitButton);
  if (!submitButton) {
    warn('検索ボタンが見つかりません。SELECTORS.searchSubmitButton / searchSubmitButtonText を見直してください。');
    return false;
  }

  // クリックでページ遷移する可能性があるため、遷移前にフラグを立てておく
  sessionStorage.setItem(APPLIED_FLAG_KEY, '1');
  submitButton.click();

  return true;
}

function isSearchAlreadyApplied() {
  return sessionStorage.getItem(APPLIED_FLAG_KEY) === '1';
}

// ---------------------------------------------------------------------------
// チケット一覧の確認・遷移
// ---------------------------------------------------------------------------

async function waitForResultsToRender() {
  // 一覧アイテムが現れる、またはタイムアウトするまで待つ
  await waitForElement(SELECTORS.ticketItem, RESULT_WAIT_TIMEOUT_MS);
  // 遅延描画の可能性を考慮し少し待つ
  await sleep(300);
}

function collectTicketItems() {
  return Array.from(document.querySelectorAll(SELECTORS.ticketItem));
}

function findMatchingTicket(items, config) {
  const targetDate = normalize(config.p_date);
  const targetNum = normalize(config.num_of_ticket);

  return items.find((item) => {
    const dateEl = item.querySelector(SELECTORS.ticketDate);
    const numEl = item.querySelector(SELECTORS.ticketNum);

    const dateText = normalize(dateEl ? dateEl.textContent : '');
    const numText = normalize(numEl ? numEl.textContent : '');

    const dateOk = !targetDate || dateText.includes(targetDate);
    const numOk = !targetNum || numText.includes(targetNum);

    return dateOk && numOk;
  });
}

function scheduleReload(reloadSec) {
  showStatus(`条件に合うチケットが見つかりません。${reloadSec}秒後に再読み込みします。`);
  setTimeout(() => {
    location.reload();
  }, reloadSec * 1000);
}

async function checkTicketsAndAct(config) {
  const reloadSec =
    config.reload_time && Number(config.reload_time) > 0
      ? Number(config.reload_time)
      : DEFAULT_RELOAD_SEC;

  showStatus('チケット一覧を確認しています…');
  await waitForResultsToRender();

  const items = collectTicketItems();

  if (items.length === 0) {
    scheduleReload(reloadSec);
    return;
  }

  const match = findMatchingTicket(items, config);

  if (!match) {
    scheduleReload(reloadSec);
    return;
  }

  // ticketItem 自体が <a>(リンク)なので、直接クリックすれば遷移する
  showStatus('条件に合うチケットを発見しました。ページへ移動します。');
  match.click();
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

async function main() {
  const config = await getConfig();

  if (!isSearchAlreadyApplied()) {
    const applied = await applySearchFilter(config);
    if (!applied) {
      showStatus('検索条件の設定に失敗しました。SELECTORS の設定を確認してください。');
      return;
    }
    // クリック後にページ遷移/再描画が発生する想定のため、ここで処理を終える。
    // 遷移後 or 再描画後にこのスクリプトが再度読み込まれ、
    // isSearchAlreadyApplied() が true になるため checkTicketsAndAct に進む。
    // SPAでページ遷移が発生しない場合は、下記を有効化してください:
    // await sleep(1000);
    // await checkTicketsAndAct(config);
    return;
  }

  await checkTicketsAndAct(config);
}

main();
