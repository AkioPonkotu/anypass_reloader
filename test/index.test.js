const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureLoggedIn, LOGIN_REQUIRED_CODE, run } = require('../src/index');

test('run is exported for GUI controllers', () => {
  assert.equal(typeof run, 'function');
});

test('ensureLoggedIn requests manual login when authentication is required', async () => {
  const email = {
    async count() { return 1; },
    first() { return this; },
    async isVisible() { return true; },
  };
  const hidden = {
    async count() { return 0; },
    first() { return this; },
    async isVisible() { return false; },
  };
  const page = {
    locator() { return email; },
    getByRole() { return hidden; },
  };

  await assert.rejects(
    ensureLoggedIn(page),
    (error) => error.code === LOGIN_REQUIRED_CODE
  );
});
