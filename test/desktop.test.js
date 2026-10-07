const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultConfigPath, parseDesktopArguments } = require('../src/desktop');

test('parseDesktopArguments accepts a config file', () => {
  assert.deepEqual(parseDesktopArguments(['--config', 'desktop.json']), { configPath: 'desktop.json' });
  assert.throws(() => parseDesktopArguments(['--config']), /設定ファイル/);
});

test('defaultConfigPath uses the app user data directory for a packaged app', () => {
  assert.equal(
    defaultConfigPath({ isPackaged: true, getPath: () => 'C:/Users/test/AppData/Roaming/AnyPASS Watcher' }),
    'C:\\Users\\test\\AppData\\Roaming\\AnyPASS Watcher\\config.json'
  );
  assert.equal(defaultConfigPath({ isPackaged: false }), 'config.json');
});
