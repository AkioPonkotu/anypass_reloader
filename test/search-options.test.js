const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSearchOptions } = require('../src/search-options');

test('extractSearchOptions returns AnyPASS artist, event, and tour values without empty placeholders', () => {
  const options = extractSearchOptions([
    { name: 'search_artist', options: [{ value: '', label: 'アーティストを選択' }, { value: 'SOPHIA', label: ' SOPHIA ' }] },
    { name: 'search_event', options: [{ value: '1001', label: 'SOPHIA\n 2026/10/15\n 18:30' }] },
    { name: 'search_tour', options: [{ value: '759', label: 'SOPHIA   TOUR  2026' }] },
  ]);

  assert.deepEqual(options, {
    search_artist: [{ value: 'SOPHIA', label: 'SOPHIA' }],
    search_event: [{ value: '1001', label: 'SOPHIA 2026/10/15 18:30' }],
    search_tour: [{ value: '759', label: 'SOPHIA TOUR 2026' }],
  });
});
