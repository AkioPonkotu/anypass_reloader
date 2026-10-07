const test = require('node:test');
const assert = require('node:assert/strict');
const { confirmPayment, isLoginRequired, openLoginPageIfNeeded } = require('../src/purchase');

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

test('confirmPayment clicks the visible confirmation button', async () => {
  const calls = [];
  const button = createLocator({ visible: true, onClick: () => calls.push('button') });
  const link = createLocator({ visible: true, onClick: () => calls.push('link') });
  const page = {
    getByRole(role, options) {
      assert.match(String(options.name), /確認/);
      return role === 'button' ? button : link;
    },
  };

  await confirmPayment(page);

  assert.deepEqual(calls, ['button']);
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
