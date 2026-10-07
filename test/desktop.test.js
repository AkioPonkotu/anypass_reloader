const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTHENTICATION_PARTITION,
  defaultConfigPath,
  flushPersistentSession,
  notifyAndFocus,
  parseDesktopArguments,
} = require('../src/desktop');

test('parseDesktopArguments accepts a config file', () => {
  assert.deepEqual(parseDesktopArguments(['--config', 'desktop.json']), { configPath: 'desktop.json' });
  assert.throws(() => parseDesktopArguments(['--config']), /設定ファイル/);
});

test('desktop uses a stable persistent partition for AnyPASS authentication', () => {
  assert.equal(AUTHENTICATION_PARTITION, 'persist:anypass-watcher');
});

test('flushPersistentSession flushes only the browser-managed persistent stores', async () => {
  const calls = [];
  const results = await flushPersistentSession({
    flushStorageData: async () => { calls.push('storage'); },
    cookies: { flushStore: async () => { calls.push('cookies'); } },
  });

  assert.deepEqual(calls.sort(), ['cookies', 'storage']);
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
});

test('flushPersistentSession tolerates unavailable stores', async () => {
  assert.deepEqual(await flushPersistentSession(), []);
  assert.deepEqual(await flushPersistentSession({}), []);
});

test('defaultConfigPath uses the app user data directory for a packaged app', () => {
  assert.equal(
    defaultConfigPath({ isPackaged: true, getPath: () => 'C:/Users/test/AppData/Roaming/AnyPASS Watcher' }),
    'C:\\Users\\test\\AppData\\Roaming\\AnyPASS Watcher\\config.json'
  );
  assert.equal(defaultConfigPath({ isPackaged: false }), 'config.json');
});

test('notifyAndFocus restores, foregrounds, and plays a notification sound', () => {
  const calls = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };

  notifyAndFocus(window, { beep: () => calls.push('beep') });

  assert.deepEqual(calls, ['restore', 'show', 'focus', 'beep']);
});

test('notifyAndFocus can notify without taking focus from an input in the app', () => {
  const calls = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };

  notifyAndFocus(window, { beep: () => calls.push('beep') }, { focus: false });

  assert.deepEqual(calls, ['show', 'beep']);
});

test('notifyAndFocus skips a destroyed window while still sounding the alert', () => {
  const calls = [];
  notifyAndFocus({ isDestroyed: () => true }, { beep: () => calls.push('beep') });
  assert.deepEqual(calls, ['beep']);
});
