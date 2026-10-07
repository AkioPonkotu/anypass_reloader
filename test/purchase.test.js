const test = require('node:test');
const assert = require('node:assert/strict');
const {
  advanceToPaymentEntry,
  confirmPayment,
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
      assert.match('購入を確定する', options.name);
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
    /出品枚数 3 枚が希望枚数 2 枚と一致しません/
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
