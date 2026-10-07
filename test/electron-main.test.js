const test = require('node:test');
const assert = require('node:assert/strict');
const { isElectronMainProcess } = require('../src/electron-main');

test('isElectronMainProcess supports Electron CLI dynamic imports', () => {
  assert.equal(isElectronMainProcess({ electronVersion: undefined }), false);
  assert.equal(isElectronMainProcess({ electronVersion: '44.6.0' }), true);
  assert.equal(isElectronMainProcess({ electronVersion: '44.6.0', processType: 'renderer' }), false);
});
