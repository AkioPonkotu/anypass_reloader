const test = require('node:test');
const assert = require('node:assert/strict');
const {
  agreeToPurchaseTerms,
  advanceToPaymentEntry,
  confirmPayment,
  isTicketCountMismatchError,
  isLoginRequired,
  openLoginPageIfNeeded,
  setPurchaseTicketCount,
} = require('../src/purchase');

function createLocator({ visible, onClick }) {
  return {
    async count() {
      return 1;
    },
    first() {
      return this;
    },
    async isVisible() {
      return visible;
    },
    async click() {
      onClick();
    },
  };
}

test('confirmPayment clicks the payment and purchase confirmation buttons', async () => {
  const calls = [];
  const paymentConfirmation = createLocator({ visible: true, onClick: () => calls.push('payment') });
  const purchaseConfirmation = createLocator({ visible: true, onClick: () => calls.push('purchase') });
  const hidden = createLocator({ visible: false, onClick: () => {} });
  const page = {
    getByRole(role, options) {
      if (role !== 'button') return hidden;
      if (options.name.test('確認')) return paymentConfirmation;
      assert.match('購入を確定する（支払いに同意）', options.name);
      return purchaseConfirmation;
    },
  };

  await confirmPayment(page);

  assert.deepEqual(calls, ['payment', 'purchase']);
});

test('confirmPayment fails without a visible confirmation control', async () => {
  const hidden = createLocator({ visible: false, onClick: () => {} });
  const page = {
    getByRole() {
      return hidden;
    },
  };

  await assert.rejects(confirmPayment(page), /決済確認ボタンが見つかりません/);
});

test('advanceToPaymentEntry waits for and clicks the updated checkout label', async () => {
  const calls = [];
  let paymentVisible = false;
  const hidden = createLocator({ visible: false, onClick: () => {} });
  const checkout = createLocator({
    visible: true,
    onClick: () => {
      calls.push('checkout');
      paymentVisible = true;
    },
  });
  const payment = {
    async isVisible() {
      return paymentVisible;
    },
    async waitFor() {
      assert.equal(paymentVisible, true);
    },
  };
  const page = {
    locator(selector) {
      return selector === '#ccNumber_disp' ? payment : hidden;
    },
    getByRole(role, options) {
      if (role === 'button') {
        assert.match('購入手続きに進む', options.name);
        return checkout;
      }
      return hidden;
    },
    async waitForTimeout() {},
  };

  await advanceToPaymentEntry(page);

  assert.deepEqual(calls, ['checkout']);
});

test('agreeToPurchaseTerms checks every unchecked purchase agreement', async () => {
  const checks = [false, true];
  const calls = [];
  const page = {
    locator(selector) {
      assert.equal(selector, '#purchase_term_check input[name="purchase-check"]');
      return {
        async count() { return checks.length; },
        nth(index) {
          return {
            async isChecked() { return checks[index]; },
            locator() {
              return {
                async count() { return 0; },
                first() { return this; },
              };
            },
            async check(options) {
              calls.push({ index, options });
              checks[index] = true;
            },
          };
        },
      };
    },
  };

  await agreeToPurchaseTerms(page);

  assert.deepEqual(checks, [true, true]);
  assert.deepEqual(calls, [{ index: 0, options: { force: true } }]);
});

test('agreeToPurchaseTerms clicks the visible label when its checkbox is outside the viewport', async () => {
  let checked = false;
  const calls = [];
  const visibleLabel = {
    async count() { return 1; },
    first() { return this; },
    async isVisible() { return true; },
    async click(options) {
      calls.push({ target: 'label', options });
      checked = true;
    },
  };
  const hiddenLabel = {
    async count() { return 0; },
    first() { return this; },
  };
  const checkbox = {
    async isChecked() { return checked; },
    locator(selector) {
      return selector.includes('following-sibling') ? visibleLabel : hiddenLabel;
    },
    async check() {
      throw new Error('Element is outside of the viewport');
    },
  };
  const page = {
    locator(selector) {
      assert.equal(selector, '#purchase_term_check input[name="purchase-check"]');
      return {
        async count() { return 1; },
        nth() { return checkbox; },
      };
    },
  };

  await agreeToPurchaseTerms(page);

  assert.equal(checked, true);
  assert.deepEqual(calls, [{ target: 'label', options: { noWaitAfter: true } }]);
});

test('agreeToPurchaseTerms falls back to a DOM click when no visible label exists', async () => {
  let checked = false;
  const calls = [];
  const checkbox = {
    async isChecked() { return checked; },
    locator() {
      return {
        async count() { return 0; },
        first() { return this; },
      };
    },
    async check() {
      throw new Error('Element is outside of the viewport');
    },
    async evaluate(callback) {
      calls.push('evaluate');
      callback({ click: () => { checked = true; } });
    },
  };
  const page = {
    locator() {
      return {
        async count() { return 1; },
        nth() { return checkbox; },
      };
    },
  };

  await agreeToPurchaseTerms(page);

  assert.equal(checked, true);
  assert.deepEqual(calls, ['evaluate']);
});

function createLoginPage({ emailVisible = false, loginVisible = false, onLoginClick = () => {} } = {}) {
  const email = createLocator({ visible: emailVisible, onClick: () => {} });
  const login = createLocator({ visible: loginVisible, onClick: onLoginClick });
  return {
    locator(selector) {
      return selector.includes('email') || selector.includes('mail') ? email : createLocator({ visible: false, onClick: () => {} });
    },
    getByRole() {
      return login;
    },
  };
}

test('isLoginRequired detects a visible login button', async () => {
  assert.equal(await isLoginRequired(createLoginPage({ loginVisible: true })), true);
  assert.equal(await isLoginRequired(createLoginPage()), false);
});

test('openLoginPageIfNeeded opens the login screen only from a login button', async () => {
  const calls = [];
  assert.equal(
    await openLoginPageIfNeeded(createLoginPage({ loginVisible: true, onLoginClick: () => calls.push('login') })),
    true
  );
  assert.deepEqual(calls, ['login']);

  assert.equal(await openLoginPageIfNeeded(createLoginPage({ emailVisible: true })), true);
  assert.deepEqual(calls, ['login']);
});

function createNoAmountSelectPage() {
  return {
    locator(selector) {
      assert.equal(selector, 'select[name^="amount["]');
      return {
        async count() {
          return 0;
        },
      };
    },
  };
}

test('setPurchaseTicketCount continues without a selector for a matching no-partial-purchase listing', async () => {
  await assert.doesNotReject(
    setPurchaseTicketCount(createNoAmountSelectPage(), 2, {
      text: '一般指定席 × 2枚 バラ購入不可',
    })
  );
});

test('setPurchaseTicketCount rejects a no-partial-purchase listing with a different ticket count', async () => {
  await assert.rejects(
    setPurchaseTicketCount(createNoAmountSelectPage(), 2, {
      text: '一般指定席 × 3枚 バラ購入不可',
    }),
    (error) => {
      assert.match(error.message, /出品枚数 3 枚が希望枚数 2 枚と一致しません/);
      return isTicketCountMismatchError(error);
    }
  );
});

test('setPurchaseTicketCount marks an unavailable requested select value as a count mismatch', async () => {
  const page = {
    locator(selector) {
      assert.equal(selector, 'select[name^="amount["]');
      return {
        async count() { return 1; },
        first() {
          return {
            locator(optionSelector) {
              assert.equal(optionSelector, 'option');
              return { evaluateAll: async () => ['1'] };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    setPurchaseTicketCount(page, 2),
    (error) => {
      assert.match(error.message, /希望枚数 2 枚はこの出品では選択できません/);
      return isTicketCountMismatchError(error);
    }
  );
});

test('setPurchaseTicketCount still rejects a missing selector for listings that allow partial purchase', async () => {
  await assert.rejects(
    setPurchaseTicketCount(createNoAmountSelectPage(), 2, {
      text: '一般指定席 × 2枚',
    }),
    /購入枚数プルダウンを確認できませんでした/
  );
});
