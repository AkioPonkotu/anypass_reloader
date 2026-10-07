function normalize(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[０-９]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0)
    )
    .trim();
}

function extractTicketCount(text) {
  const match = normalize(text).match(/[×x]([0-9]+)枚/iu);
  return match ? Number(match[1]) : null;
}

function extractTicketPrice(text) {
  const match = normalize(text).match(/[¥￥]([0-9][0-9,]*)\/1枚/u);
  return match ? Number(match[1].replaceAll(',', '')) : null;
}

function extractTicketDate(text) {
  const normalized = normalize(text);
  const match = normalized.match(/(\d{4})(?:\/|-|年)(\d{1,2})(?:\/|-|月)(\d{1,2})(?:日)?/u);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${yearText}-${monthText.padStart(2, '0')}-${dayText.padStart(2, '0')}`;
}

function findMatchingTicket(tickets, criteria) {
  const expectedDate = normalize(criteria.date);

  return tickets.find((ticket) => {
    const text = normalize(ticket.text);
    const dateMatches = !expectedDate || text.includes(expectedDate);
    const ticketDate = extractTicketDate(text);
    const rangeMatches =
      (!criteria.dateFrom || (ticketDate !== null && ticketDate >= criteria.dateFrom)) &&
      (!criteria.dateTo || (ticketDate !== null && ticketDate <= criteria.dateTo));
    const countMatches =
      !criteria.ticketCount || extractTicketCount(text) === criteria.ticketCount;
    const price = extractTicketPrice(text);
    const budgetMatches =
      !criteria.budget || (price !== null && price <= criteria.budget);

    return dateMatches && rangeMatches && countMatches && budgetMatches;
  });
}

module.exports = {
  extractTicketCount,
  extractTicketDate,
  extractTicketPrice,
  findMatchingTicket,
  normalize,
};
