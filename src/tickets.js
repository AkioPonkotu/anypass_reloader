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

function findMatchingTicket(tickets, criteria) {
  const expectedDate = normalize(criteria.date);

  return tickets.find((ticket) => {
    const text = normalize(ticket.text);
    const dateMatches = !expectedDate || text.includes(expectedDate);
    const countMatches =
      !criteria.ticketCount || extractTicketCount(text) === criteria.ticketCount;

    return dateMatches && countMatches;
  });
}

module.exports = { extractTicketCount, findMatchingTicket, normalize };
