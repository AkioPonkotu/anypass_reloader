const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDesktopArguments } = require('../src/desktop');

test('parseDesktopArguments accepts a config file', () => {
  assert.deepEqual(parseDesktopArguments(['--config', 'desktop.json']), { configPath: 'desktop.json' });
  assert.throws(() => parseDesktopArguments(['--config']), /設定ファイル/);
});
