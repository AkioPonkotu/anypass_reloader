const PAYMENT_NUMBER_SELECTOR = '#ccNumber_disp';
const PAYMENT_MONTH_SELECTOR = '#ccExpirationMonth';
const PAYMENT_YEAR_SELECTOR = '#ccExpirationYear_disp';
const PAYMENT_CVV_SELECTOR = '#securityCode';

const LOGIN_LINK_NAMES = /ログイン|sign in|log in/i;
const LOGIN_SUBMIT_NAMES = /ログイン|sign in|log in|次へ|continue/i;
const INITIAL_CHECKOUT_NAMES = /購入手続きへ|購入する|お支払いへ|支払いへ|checkout/i;
// 最初の詳細ページ以降は「購入する」のような確定に見える文言を自動クリックしない。
// これにより、決済代行画面の確認・3D セキュア開始は常に利用者が判断できる。
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

async function loginIfNeeded(page, auth) {
  if (!auth) return;

  const emailInput = () =>
    firstVisibleLocator([
      page.locator('input[type="email"]'),
      page.locator('input[name*="mail" i], input[id*="mail" i]'),
    ]);
  let email = await emailInput();

  if (!email) {
    const loginLink = await firstVisibleLocator([
      page.getByRole('link', { name: LOGIN_LINK_NAMES }),
      page.getByRole('button', { name: LOGIN_LINK_NAMES }),
    ]);
    if (!loginLink) return; // 保存済みのログイン状態である可能性がある。
    await loginLink.click({ noWaitAfter: true });
    await page
      .locator('input[type="email"], input[name*="mail" i], input[id*="mail" i]')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
    email = await emailInput();
  }

  if (!email) {
    throw new Error('ログイン画面のメールアドレス入力欄を確認できませんでした。');
  }
  await email.fill(auth.email);

  let password = await firstVisibleLocator([page.locator('input[type="password"]')]);
  if (!password) {
    await clickFirstVisible(
      [page.getByRole('button', { name: LOGIN_SUBMIT_NAMES }), page.getByRole('link', { name: LOGIN_SUBMIT_NAMES })],
      'ログインの続行ボタン'
    );
    await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    password = await firstVisibleLocator([page.locator('input[type="password"]')]);
  }
  if (!password) throw new Error('ログイン画面のパスワード入力欄を確認できませんでした。');

  await password.fill(auth.password);
  await clickFirstVisible(
    [page.getByRole('button', { name: LOGIN_SUBMIT_NAMES }), page.getByRole('link', { name: LOGIN_SUBMIT_NAMES })],
    'ログインボタン'
  );
  await page.waitForLoadState('domcontentloaded').catch(() => {});
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

module.exports = {
  advanceToPaymentEntry,
  fillPaymentEntry,
  loginIfNeeded,
};
