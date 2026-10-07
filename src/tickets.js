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

function findMatchingTicket(tickets, criteria) {
  const expectedDate = normalize(criteria.date);

  return tickets.find((ticket) => {
    const text = normalize(ticket.text);
    const dateMatches = !expectedDate || text.includes(expectedDate);
    const countMatches =
      !criteria.ticketCount || extractTicketCount(text) === criteria.ticketCount;
    const price = extractTicketPrice(text);
    const budgetMatches =
      !criteria.budget || (price !== null && price <= criteria.budget);

    return dateMatches && countMatches && budgetMatches;
  });
}

module.exports = { extractTicketCount, extractTicketPrice, findMatchingTicket, normalize };
