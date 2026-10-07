const SEARCH_FILTERS = [
  { key: 'search_artist', name: 'search_artist', label: 'アーティスト' },
  { key: 'search_event', name: 'search_event', label: 'イベント' },
  { key: 'search_tour', name: 'search_tour', label: 'ツアー' },
];

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function extractSearchOptions(selects) {
  const byName = new Map(selects.map((select) => [select.name, select.options]));
  return Object.fromEntries(SEARCH_FILTERS.map(({ key, name }) => [
    key,
    (byName.get(name) || [])
      .filter((option) => option.value)
      .map((option) => ({ value: String(option.value), label: normalizeLabel(option.label || option.text) })),
  ]));
}

async function collectSearchOptions(page, formSelector) {
  const form = page.locator(formSelector);
  await form.waitFor({ state: 'visible', timeout: 15_000 });
  const selects = await form.locator('select[name="search_artist"], select[name="search_event"], select[name="search_tour"]')
    .evaluateAll((elements) => elements.map((element) => ({
      name: element.name,
      options: Array.from(element.options, (option) => ({ value: option.value, label: option.textContent || '' })),
    })));
  return extractSearchOptions(selects);
}

module.exports = { SEARCH_FILTERS, collectSearchOptions, extractSearchOptions, normalizeLabel };
