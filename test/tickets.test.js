const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractTicketCount,
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
