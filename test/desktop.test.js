const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultConfigPath, notifyAndFocus, parseDesktopArguments } = require('../src/desktop');

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
