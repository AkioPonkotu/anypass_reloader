const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/index');

test('run is exported for GUI controllers', () => {
  assert.equal(typeof run, 'function');
});
