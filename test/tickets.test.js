const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractTicketCount,
  extractTicketDate,
  extractTicketPrice,
  findMatchingTicket,
  normalize,
} = require('../src/tickets');

test('normalize removes whitespace and converts full-width numbers', () => {
  assert.equal(normalize(' ２０２６/１０/１５\n '), '2026/10/15');
});

test('extractTicketCount reads the displayed ticket count rather than the price', () => {
  assert.equal(extractTicketCount('一般指定席 × 2枚 ¥11,000/1枚'), 2);
  assert.equal(extractTicketCount('一般指定席 ¥11,000/1枚'), null);
});

test('extractTicketPrice reads the displayed per-ticket price', () => {
  assert.equal(extractTicketPrice('一般指定席 × 2枚 ¥11,000/1枚'), 11000);
  assert.equal(extractTicketPrice('一般指定席 × 2枚'), null);
});

test('extractTicketDate normalizes supported date display formats', () => {
  assert.equal(extractTicketDate('公演日: ２０２６年１０月５日'), '2026-10-05');
  assert.equal(extractTicketDate('2026/10/05 一般指定席'), '2026-10-05');
  assert.equal(extractTicketDate('2026/02/29 一般指定席'), null);
});

test('findMatchingTicket requires both date and ticket count when specified', () => {
  const tickets = [
    { text: '2026/10/15 一般指定席 × 1枚 ¥11,000/1枚', url: 'https://example.test/one' },
    { text: '2026/10/15 一般指定席 × 2枚 ¥11,000/1枚', url: 'https://example.test/two' },
  ];

  assert.deepEqual(
    findMatchingTicket(tickets, { date: '２０２６/１０/１５', ticketCount: 2 }),
    tickets[1]
  );
});

test('findMatchingTicket excludes tickets above the per-ticket budget', () => {
  const tickets = [
    { text: '2026/10/15 一般指定席 × 2枚 ¥11,000/1枚', url: 'https://example.test/within' },
    { text: '2026/10/15 一般指定席 × 2枚 ¥13,200/1枚', url: 'https://example.test/over' },
  ];

  assert.deepEqual(
    findMatchingTicket(tickets, { date: '2026/10/15', ticketCount: 2, budget: 12000 }),
    tickets[0]
  );
});

test('findMatchingTicket applies inclusive date range matching to result dates', () => {
  const tickets = [
    { text: '2026/09/30 一般指定席 × 2枚', url: 'https://example.test/before' },
    { text: '2026/10/01 一般指定席 × 2枚', url: 'https://example.test/start' },
    { text: '2026/10/31 一般指定席 × 2枚', url: 'https://example.test/end' },
  ];

  assert.deepEqual(
    findMatchingTicket(tickets, {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      ticketCount: 2,
    }),
    tickets[1]
  );
  assert.deepEqual(
    findMatchingTicket([tickets[2]], {
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      ticketCount: 2,
    }),
    tickets[2]
  );
  assert.equal(
    findMatchingTicket(
      [{ text: '日付の記載なし 一般指定席 × 2枚', url: 'https://example.test/no-date' }],
      { dateFrom: '2026-10-01', ticketCount: 2 }
    ),
    undefined
  );
});
