const test = require('node:test');
const assert = require('node:assert/strict');
const { serverPriceMaxForBudget } = require('../src/index');

test('serverPriceMaxForBudget chooses the nearest site upper bound', () => {
  const siteOptions = ['', '1000', '10000', '15000', '100000'];

  assert.equal(serverPriceMaxForBudget(siteOptions, 12000), 15000);
  assert.equal(serverPriceMaxForBudget(siteOptions, 10000), 10000);
  assert.equal(serverPriceMaxForBudget(siteOptions, 120000), 100000);
});
