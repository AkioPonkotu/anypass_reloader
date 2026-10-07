const PAYMENT_NUMBER_SELECTOR = '#ccNumber_disp';
const PAYMENT_MONTH_SELECTOR = '#ccExpirationMonth';
const PAYMENT_YEAR_SELECTOR = '#ccExpirationYear_disp';
const PAYMENT_CVV_SELECTOR = '#securityCode';
const PAYMENT_CONFIRMATION_NAMES = /^(?:確認|confirmation)$/i;
const PURCHASE_CONFIRMATION_NAMES = /^(?:購入を?確定(?:する)?|購入する|注文を?確定(?:する)?|確定して購入|complete purchase|place order)$/i;
const { extractTicketCount, isIndividualPurchaseUnavailable } = require('./tickets');

const LOGIN_LINK_NAMES = /ログイン|sign in|log in/i;
// AnyPASS の画面文言は「購入手続きへ」だけでなく、「購入手続きに進む」や
// 「お申込み手続きを進める」のようにイベントごとに変わることがある。
// 購入確定に相当する文言はここには含めず、詳細画面から決済入力画面までの導線だけを対象にする。
const INITIAL_CHECKOUT_NAMES = /購入手続き(?:へ|に|を)?(?:進む|進める|する)?|購入(?:へ|に)(?:進む|進める)|購入する|お申込み?手続き(?:へ|に|を)?(?:進む|進める|する)?|お支払いへ|支払いへ|checkout/i;
// 最初の詳細ページ以降は「購入する」のような確定に見える文言を自動クリックしない。
// 決済代行画面では、カード情報確認後に表示される購入確定ボタンだけを押して
// 3D セキュアの開始画面まで進める。3D セキュアの認証入力・完了操作は利用者が行う。
const CONTINUE_TO_PAYMENT_NAMES = /購入手続き(?:へ|に|を)?(?:進む|進める|する)?|お申込み?手続き(?:へ|に|を)?(?:進む|進める|する)?|お支払いへ|支払いへ|checkout/i;
const CHECKOUT_CONTROL_WAIT_MS = 15_000;

async function firstVisibleLocator(locators, timeout = 0) {
  const deadline = Date.now() + timeout;

  do {
    for (const locator of locators) {
      if ((await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false))) {
        return locator.first();
      }
    }

    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, deadline - Date.now())));
  } while (true);

  return null;
}

async function clickFirstVisible(locators, description, timeout) {
  const locator = await firstVisibleLocator(locators, timeout);
  if (!locator) throw new Error(`${description}が見つかりませんでした。サイトの画面を確認してください。`);
  await locator.click({ noWaitAfter: true });
}

function checkoutControls(page, names) {
  const controls = [
    page.getByRole('button', { name: names }),
    page.getByRole('link', { name: names }),
  ];

  // SPA のマークアップ変更で button/link のアクセシブル名が取れない場合も、画面に
  // 表示されている導線を押せるようテキストベースの候補を補助的に使う。
  if (typeof page.getByText === 'function') controls.push(page.getByText(names));
  return controls;
}

function loginInputs(page) {
  return [
    page.locator('input[type="email"]'),
    page.locator('input[name*="mail" i], input[id*="mail" i]'),
  ];
}

function loginLinks(page) {
  return [
    page.getByRole('link', { name: LOGIN_LINK_NAMES }),
    page.getByRole('button', { name: LOGIN_LINK_NAMES }),
  ];
}

// Cookie の有無ではなく、実際に表示されているログイン導線で認証切れを判断する。
// これにより、失効済み Cookie が残っている場合も手動ログインを促せる。
async function isLoginRequired(page) {
  return Boolean(await firstVisibleLocator([...loginInputs(page), ...loginLinks(page)]));
}

// 未ログイン時は AnyPASS のログイン導線を開く。すでにメールアドレス欄が見えている
// 場合は遷移済みなので操作しない。
async function openLoginPageIfNeeded(page) {
  if (await firstVisibleLocator(loginInputs(page))) return true;
  const loginLink = await firstVisibleLocator(loginLinks(page));
  if (!loginLink) return false;
  await loginLink.click({ noWaitAfter: true });
  return true;
}

async function setPurchaseTicketCount(page, ticketCount, matchedTicket) {
  if (!ticketCount) {
    throw new Error('購入枚数が未設定です。num_of_ticket を指定してください。');
  }

  const amountSelects = page.locator('select[name^="amount["]');
  const selectCount = await amountSelects.count();
  if (selectCount === 0) {
    const listingText = matchedTicket?.text;
    if (isIndividualPurchaseUnavailable(listingText)) {
      const listedTicketCount = extractTicketCount(listingText);
      if (listedTicketCount === ticketCount) return;

      throw new Error(
        `バラ購入不可の出品枚数 ${listedTicketCount ?? '不明'} 枚が希望枚数 ${ticketCount} 枚と一致しません。`
      );
    }
    throw new Error('詳細画面の購入枚数プルダウンを確認できませんでした。');
  }
  if (selectCount > 1) {
    throw new Error('購入枚数プルダウンが複数あります。誤った合計枚数を選ばないよう自動購入を停止しました。');
  }

  const amountSelect = amountSelects.first();
  const requestedValue = String(ticketCount);
  const availableValues = await amountSelect.locator('option').evaluateAll((options) =>
    options.map((option) => option.value)
  );
  if (!availableValues.includes(requestedValue)) {
    throw new Error(
      `希望枚数 ${ticketCount} 枚はこの出品では選択できません（選択可能: ${availableValues.join(', ')} 枚）。`
    );
  }

  // ネイティブ select を更新して input/change イベントを発火するため、フォーム送信値と
  // 画面上のカスタムプルダウン表示が食い違わない。
  await amountSelect.selectOption({ value: requestedValue }, { force: true });
  const selectedValue = await amountSelect.inputValue();
  if (selectedValue !== requestedValue) {
    throw new Error(`購入枚数を ${ticketCount} 枚に設定できませんでした。`);
  }
}

async function advanceToPaymentEntry(page) {
  for (let step = 0; step < 3; step += 1) {
    if (await page.locator(PAYMENT_NUMBER_SELECTOR).isVisible().catch(() => false)) return;
    await clickFirstVisible(
      checkoutControls(page, step === 0 ? INITIAL_CHECKOUT_NAMES : CONTINUE_TO_PAYMENT_NAMES),
      '購入手続きボタン',
      CHECKOUT_CONTROL_WAIT_MS
    );
    await page.waitForTimeout(500);
  }
  await page.locator(PAYMENT_NUMBER_SELECTOR).waitFor({ state: 'visible', timeout: 15_000 });
}

async function fillPaymentEntry(page, creditCard) {
  await page.locator(PAYMENT_NUMBER_SELECTOR).waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator(PAYMENT_NUMBER_SELECTOR).fill(creditCard.number);
  await page.locator(PAYMENT_MONTH_SELECTOR).fill(creditCard.expirationMonth);
  await page.locator(PAYMENT_YEAR_SELECTOR).fill(creditCard.expirationYear);
  await page.locator(PAYMENT_CVV_SELECTOR).fill(creditCard.cvv);
}

async function confirmPayment(page) {
  await clickFirstVisible(
    [
      page.getByRole('button', { name: PAYMENT_CONFIRMATION_NAMES }),
      page.getByRole('link', { name: PAYMENT_CONFIRMATION_NAMES }),
    ],
    '決済確認ボタン'
  );

  await clickFirstVisible(
    checkoutControls(page, PURCHASE_CONFIRMATION_NAMES),
    '購入確定ボタン',
    CHECKOUT_CONTROL_WAIT_MS
  );
}

module.exports = {
  advanceToPaymentEntry,
  confirmPayment,
  fillPaymentEntry,
  isLoginRequired,
  openLoginPageIfNeeded,
  setPurchaseTicketCount,
};
