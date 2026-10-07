const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeConfig, parseGuiArguments, sanitizeConfig } = require('../src/gui');

test('parseGuiArguments accepts GUI options', () => {
  assert.deepEqual(parseGuiArguments(['--config', 'settings.json', '--port', '9876', '--no-open']), {
    configPath: 'settings.json', port: 9876, open: false,
  });
  assert.throws(() => parseGuiArguments(['--port', '0']), /1〜65535/);
});

test('sanitizeConfig never returns card data', () => {
  const config = sanitizeConfig({
    free_word: 'SOPHIA',
    auth: { email: 'person@example.com', password: 'secret' },
    credit_card: { number: '4111111111111111', expiration_month: '12', expiration_year: '28', cvv: '123' },
  });
  assert.equal(Object.hasOwn(config, 'credit_card'), false);
  assert.equal(Object.hasOwn(config, 'auth'), false);
  assert.equal(JSON.stringify(config).includes('person@example.com'), false);
  assert.equal(JSON.stringify(config).includes('secret'), false);
});

test('mergeConfig removes legacy authentication and card data', () => {
  const merged = mergeConfig(
    {
      free_word: 'Old',
      auth: { email: 'old@example.com', password: 'saved-password' },
      credit_card: { number: '4111111111111111', expiration_month: '12', expiration_year: '28', cvv: '123' },
    },
    { free_word: 'New', credit_card: { number: '************1111', expiration_month: '12', cvv: '' } }
  );
  assert.equal(merged.free_word, 'New');
  assert.equal(Object.hasOwn(merged, 'auth'), false);
  assert.equal(Object.hasOwn(merged, 'credit_card'), false);
});

test('mergeConfig enables the required detail page when auto purchase is enabled', () => {
  const merged = mergeConfig(
    { free_word: 'SOPHIA', open_match_page: false },
    { auto_purchase: true, open_match_page: false }
  );

  assert.equal(merged.auto_purchase, true);
  assert.equal(merged.open_match_page, true);
});

test('mergeConfig preserves AnyPASS dropdown selections', () => {
  const merged = mergeConfig({}, { search_artist: 'SOPHIA', search_event: '1003741', search_tour: '759' });

  assert.deepEqual(
    { search_artist: merged.search_artist, search_event: merged.search_event, search_tour: merged.search_tour },
    { search_artist: 'SOPHIA', search_event: '1003741', search_tour: '759' }
  );
  assert.equal(sanitizeConfig(merged).search_event, '1003741');
});
