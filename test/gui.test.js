const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeConfig, parseGuiArguments, sanitizeConfig } = require('../src/gui');

test('parseGuiArguments accepts GUI options', () => {
  assert.deepEqual(parseGuiArguments(['--config', 'settings.json', '--port', '9876', '--no-open']), {
    configPath: 'settings.json', port: 9876, open: false,
  });
  assert.throws(() => parseGuiArguments(['--port', '0']), /1〜65535/);
});

test('sanitizeConfig never returns saved secrets', () => {
  const config = sanitizeConfig({
    free_word: 'SOPHIA',
    auth: { email: 'person@example.com', password: 'secret' },
    credit_card: { number: '4111111111111111', expiration_month: '12', expiration_year: '28', cvv: '123' },
  });
  assert.deepEqual(config.credit_card, { has_saved_card: true });
  assert.equal(Object.hasOwn(config, 'auth'), false);
  assert.equal(JSON.stringify(config).includes('person@example.com'), false);
  assert.equal(JSON.stringify(config).includes('4111111111111111'), false);
  assert.equal(JSON.stringify(config).includes('secret'), false);
});

test('mergeConfig removes legacy authentication data and keeps card data when blank fields are submitted', () => {
  const merged = mergeConfig(
    {
      free_word: 'Old',
      auth: { email: 'old@example.com', password: 'saved-password' },
      credit_card: { number: '4111111111111111', expiration_month: '12', expiration_year: '28', cvv: '123' },
    },
    { free_word: 'New', credit_card: { number: '', cvv: '' } }
  );
  assert.equal(merged.free_word, 'New');
  assert.equal(Object.hasOwn(merged, 'auth'), false);
  assert.equal(merged.credit_card.number, '4111111111111111');
});
