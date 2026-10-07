const test = require('node:test');
const assert = require('node:assert/strict');
const { MINIMUM_RELOAD_SECONDS, normalizeConfig } = require('../src/config');

test('normalizeConfig supplies defaults and resolves paths from the config directory', () => {
  const config = normalizeConfig(
    { free_word: 'SOPHIA', max_price_per_ticket: 12000 },
    'C:/work/anypass'
  );

  assert.equal(config.reloadSeconds, 10);
  assert.equal(config.headless, true);
  assert.equal(config.budget, 12000);
  assert.equal(config.userDataDir, 'C:\\work\\anypass\\.anypass-profile');
});

test('normalizeConfig rejects an empty search condition and too-fast reloads', () => {
  assert.throws(() => normalizeConfig({}, 'C:/work/anypass'), /いずれかを設定/);
  assert.throws(
    () =>
      normalizeConfig(
        { p_date: '2026/10/15', reload_time: MINIMUM_RELOAD_SECONDS / 2 },
        'C:/work/anypass'
      ),
    new RegExp(`${MINIMUM_RELOAD_SECONDS} 秒以上`)
  );
  assert.throws(
    () => normalizeConfig({ budget: 0 }, 'C:/work/anypass'),
    /1 円以上/
  );
});

test('normalizeConfig accepts AnyPASS dropdown selections as search conditions', () => {
  const config = normalizeConfig({ search_artist: 'SOPHIA', search_event: 1003741, search_tour: 759 }, 'C:/work/anypass');

  assert.equal(config.search_artist, 'SOPHIA');
  assert.equal(config.search_event, '1003741');
  assert.equal(config.search_tour, '759');
});

test('normalizeConfig normalizes inclusive date range boundaries', () => {
  const config = normalizeConfig(
    { p_date_from: '2026/10/01', p_date_to: '2026-10-31' },
    'C:/work/anypass'
  );

  assert.equal(config.dateFrom, '2026-10-01');
  assert.equal(config.dateTo, '2026-10-31');
});

test('normalizeConfig rejects invalid or reversed date ranges', () => {
  assert.throws(
    () => normalizeConfig({ p_date_from: '2026/02/29' }, 'C:/work/anypass'),
    /実在する日付/
  );
  assert.throws(
    () =>
      normalizeConfig(
        { p_date_from: '2026/10/31', p_date_to: '2026/10/01' },
        'C:/work/anypass'
      ),
    /以前の日付/
  );
  assert.throws(
    () =>
      normalizeConfig(
        { p_date: '2026/10/15', p_date_from: '2026/10/01' },
        'C:/work/anypass'
      ),
    /同時に指定できません/
  );
});

test('normalizeConfig does not retain checkout card data from config.json', () => {
  const config = normalizeConfig(
    {
      free_word: 'SOPHIA',
      num_of_ticket: 2,
      auto_purchase: true,
    },
    'C:/work/anypass'
  );

  assert.equal(config.autoPurchase, true);
  assert.equal(Object.hasOwn(config, 'creditCard'), false);
});

test('normalizeConfig requires the non-sensitive settings for checkout', () => {
  assert.throws(
    () =>
      normalizeConfig(
        {
          free_word: 'SOPHIA',
          auto_purchase: true,
        },
        'C:/work/anypass'
      ),
    /num_of_ticket/
  );
  assert.throws(
    () =>
      normalizeConfig(
        {
          free_word: 'SOPHIA',
          num_of_ticket: 2,
          auto_purchase: true,
          open_match_page: false,
        },
        'C:/work/anypass'
      ),
    /open_match_page/
  );
  assert.throws(
    () =>
      normalizeConfig(
        {
          free_word: 'SOPHIA',
          auto_purchase: true,
        },
        'C:/work/anypass'
      ),
    /num_of_ticket/
  );
});
