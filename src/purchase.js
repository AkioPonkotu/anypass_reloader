const PAYMENT_NUMBER_SELECTOR = '#ccNumber_disp';
const PAYMENT_MONTH_SELECTOR = '#ccExpirationMonth';
const PAYMENT_YEAR_SELECTOR = '#ccExpirationYear_disp';
const PAYMENT_CVV_SELECTOR = '#securityCode';
const PAYMENT_CONFIRMATION_NAMES = /^(?:確認|confirmation)$/i;

const LOGIN_LINK_NAMES = /ログイン|sign in|log in/i;
const INITIAL_CHECKOUT_NAMES = /購入手続きへ|購入する|お支払いへ|支払いへ|checkout/i;
// 最初の詳細ページ以降は「購入する」のような確定に見える文言を自動クリックしない。
// 決済代行画面では明示的に「確認」だけをクリックし、3D セキュアの認証自体は利用者が行う。
const CONTINUE_TO_PAYMENT_NAMES = /購入手続きへ|お支払いへ|支払いへ|checkout/i;

async function firstVisibleLocator(locators) {
  for (const locator of locators) {
    if ((await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false))) {
      return locator.first();
    }
  }
  return null;
}

async function clickFirstVisible(locators, description) {
  const locator = await firstVisibleLocator(locators);
  if (!locator) throw new Error(`${description}が見つかりませんでした。サイトの画面を確認してください。`);
  await locator.click({ noWaitAfter: true });
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

async function setPurchaseTicketCount(page, ticketCount) {
  if (!ticketCount) {
    throw new Error('購入枚数が未設定です。num_of_ticket を指定してください。');
  }

  const amountSelects = page.locator('select[name^="amount["]');
  const selectCount = await amountSelects.count();
  if (selectCount === 0) {
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
      [
        page.getByRole('button', { name: step === 0 ? INITIAL_CHECKOUT_NAMES : CONTINUE_TO_PAYMENT_NAMES }),
        page.getByRole('link', { name: step === 0 ? INITIAL_CHECKOUT_NAMES : CONTINUE_TO_PAYMENT_NAMES }),
      ],
      '購入手続きボタン'
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
}

module.exports = {
  advanceToPaymentEntry,
  confirmPayment,
  fillPaymentEntry,
  isLoginRequired,
  openLoginPageIfNeeded,
  setPurchaseTicketCount,
};
