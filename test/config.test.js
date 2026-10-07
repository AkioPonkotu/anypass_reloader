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
