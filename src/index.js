const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { readConfig } = require('./config');
const { findMatchingTicket } = require('./tickets');
const {
  advanceToPaymentEntry,
  fillPaymentEntry,
  loginIfNeeded,
  setPurchaseTicketCount,
} = require('./purchase');

const RESALE_LIST_URL = 'https://store.anypass.jp/resale-list';
const FORM_SELECTOR = 'form#resale_sidebar_pc_search_form';
const TICKET_SELECTOR = 'a.item.resale-list-item';

function parseArguments(argv) {
  const options = { configPath: 'config.json', once: false, headed: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--config') {
      options.configPath = argv[index + 1];
      if (!options.configPath) throw new Error('--config の後に設定ファイルのパスを指定してください。');
      index += 1;
    } else if (argument === '--once') {
      options.once = true;
    } else if (argument === '--headed') {
      options.headed = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`不明なオプションです: ${argument}`);
    }
  }

  return options;
}

function usage() {
  return [
    '使い方: npm start -- [--config config.json] [--once] [--headed]',
    '',
    '  --config <path>  設定 JSON（既定: config.json）',
    '  --once           1 回だけ検索して終了',
    '  --headed         設定の headless を上書きしてブラウザを表示',
  ].join('\n');
}

function log(message) {
  console.log(`[${new Date().toLocaleString('ja-JP')}] ${message}`);
}

function ticketCountLabel(ticketCount) {
  if (!ticketCount) return null;
  return ticketCount >= 3 ? '3枚以上' : `${ticketCount}枚`;
}

function serverPriceMaxForBudget(optionValues, budget) {
  if (!budget) return null;

  const availableValues = optionValues
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);
  const matchingValue = availableValues.find((value) => value >= budget);

  return matchingValue || availableValues.at(-1) || null;
}

async function applySearchFilter(page, config) {
  const form = page.locator(FORM_SELECTOR);
  await form.waitFor({ state: 'visible', timeout: 15_000 });

  const freeWordInput = form.locator('#free_word_input_pc');
  await freeWordInput.fill(config.freeWord);

  const ticketCount = ticketCountLabel(config.ticketCount);
  if (ticketCount) {
    // サイトは select を独自 UI で覆うため、ネイティブ要素へ値を設定して change を発火する。
    await form
      .locator('select[name="ticket_count"]')
      .selectOption({ label: ticketCount }, { force: true });
  }

  if (config.budget) {
    const priceMax = form.locator('select[name="price_max"]');
    const optionValues = await priceMax.locator('option').evaluateAll((options) =>
      options.map((option) => option.value)
    );
    const serverPriceMax = serverPriceMaxForBudget(optionValues, config.budget);
    if (!serverPriceMax) {
      throw new Error('サイトの金額上限フィルターの選択肢を取得できませんでした。');
    }
    // サイトの上限は段階値のみのため、予算以上で最も近い値を指定する。
    // 厳密な予算判定は findMatchingTicket() で 1 枚当たり価格に対して行う。
    await priceMax.selectOption({ value: String(serverPriceMax) }, { force: true });
  }

  const excludeInProgress = form.locator(
    'input[name="resale_item_not_being_purchased"]'
  );
  if (!(await excludeInProgress.isChecked())) {
    await excludeInProgress.check();
  }

  // 検索は POST 後に同じ URL へ遷移する。click() のナビゲーション待機に任せると、
  // 外部 iframe の load 完了待ちに巻き込まれるため、送信だけ行って一覧の出現を待つ。
  await form
    .getByRole('button', { name: '検索', exact: true })
    .click({ noWaitAfter: true });
  await page.waitForTimeout(500);
}

async function collectTickets(page) {
  await page.locator(TICKET_SELECTOR).first().waitFor({ state: 'attached', timeout: 8_000 }).catch(() => {});

  return page.locator(TICKET_SELECTOR).evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent || '',
      url: element.href,
    }))
  );
}

async function searchOnce(page, config) {
  await page.goto(RESALE_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await applySearchFilter(page, config);

  const tickets = await collectTickets(page);
  return { tickets, match: findMatchingTicket(tickets, config) };
}

async function captureMatch(page, config) {
  await fs.mkdir(config.screenshotDir, { recursive: true });
  const name = `match-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filePath = path.join(config.screenshotDir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForManualCheckout(page, isStopRequested) {
  // 確認画面（およびユーザーが続けた 3D セキュア画面）を閉じないため、明示的な停止または
  // ウィンドウを閉じる操作までプロセスを維持する。
  while (!isStopRequested() && !page.isClosed()) {
    await delay(500);
  }
}

async function run(options) {
  const config = readConfig(options.configPath);
  if (options.headed) config.headless = false;

  // Chromium は起動後に headless/headed を切り替えられない。決済情報入力画面と
  // 3D セキュア直前を必ず利用者が見られるよう、自動購入時は最初から headed にする。
  if (config.autoPurchase && config.headless) {
    config.headless = false;
    log('auto_purchase が有効なため、決済画面以降を表示できるようブラウザを headed で起動します。');
  }

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    viewport: { width: 1440, height: 1000 },
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  let stopRequested = false;
  const requestStop = () => {
    stopRequested = true;
    log('停止要求を受け取りました。現在の処理を完了して終了します。');
  };
  process.once('SIGINT', requestStop);
  process.once('SIGTERM', requestStop);

  try {
    await page.goto(RESALE_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await loginIfNeeded(page, config.auth);

    do {
      const { tickets, match } = await searchOnce(page, config);

      if (match) {
        log(`条件に一致するチケットを検出しました: ${match.url}`);
        const screenshotPath = await captureMatch(page, config);
        log(`一覧のスクリーンショットを保存しました: ${screenshotPath}`);

        if (config.openMatchPage) {
          await page.goto(match.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          if (config.autoPurchase) {
            await setPurchaseTicketCount(page, config.ticketCount);
            await advanceToPaymentEntry(page);
            await fillPaymentEntry(page, config.creditCard);
            await page.bringToFront();
            log('決済情報を入力しました。確認ボタンは押していません。3Dセキュア開始前に画面で内容を確認してください。ウィンドウを閉じるか Ctrl+C で終了します。');
            await waitForManualCheckout(page, () => stopRequested);
          } else {
            log('該当チケットの詳細ページを開きました。購入・確定操作は行いません。');
          }
        }
        return true;
      }

      log(`一致するチケットはありません（検索結果 ${tickets.length} 件）。`);
      if (options.once || stopRequested) return false;

      log(`${config.reloadSeconds} 秒後に再検索します。`);
      await delay(config.reloadSeconds * 1000);
    } while (!stopRequested);

    return false;
  } finally {
    process.removeListener('SIGINT', requestStop);
    process.removeListener('SIGTERM', requestStop);
    await context.close();
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  await run(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`エラー: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  collectTickets,
  parseArguments,
  searchOnce,
  serverPriceMaxForBudget,
  ticketCountLabel,
};
