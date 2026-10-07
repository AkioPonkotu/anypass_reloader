const test = require('node:test');
const assert = require('node:assert/strict');
const { confirmPayment } = require('../src/purchase');

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
