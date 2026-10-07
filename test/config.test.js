const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('../src/config');

test('normalizeConfig supplies defaults and resolves paths from the config directory', () => {
  const config = normalizeConfig({ free_word: 'SOPHIA' }, 'C:/work/anypass');

  assert.equal(config.reloadSeconds, 10);
  assert.equal(config.headless, true);
  assert.equal(config.userDataDir, 'C:\\work\\anypass\\.anypass-profile');
});

test('normalizeConfig rejects an empty search condition and too-fast reloads', () => {
  assert.throws(() => normalizeConfig({}, 'C:/work/anypass'), /いずれかを設定/);
  assert.throws(
    () => normalizeConfig({ p_date: '2026/10/15', reload_time: 2 }, 'C:/work/anypass'),
    /3 秒以上/
  );
});
