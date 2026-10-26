import { addTickets, normalizeState } from './engine.mjs';

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const nameOrder = new Intl.Collator('de-DE', { sensitivity: 'base', numeric: true });
const exactNameOrder = new Intl.Collator('de-DE', { sensitivity: 'variant', numeric: true });
const number = new Intl.NumberFormat('de-DE');

export function parseBulkEntries(input) {
  if (typeof input !== 'string') throw new Error('Die Sammelliste muss Text enthalten.');
  const lines = input.replace(/^\uFEFF/u, '').split(/\r\n|\n|\r/u);
  const entries = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    const label = `Zeile ${index + 1}`;
    if (entries.length === 100) throw new Error(`${label}: Pro Sammelliste sind höchstens 100 Einträge möglich.`);
    const parts = line.split(';');
    if (parts.length > 2) throw new Error(`${label}: Verwende „RP-Name;Anzahl“ oder nur den RP-Namen.`);
    const name = parts[0].trim();
    if (CONTROL.test(parts[0]) || name.length < 2 || name.length > 40) {
      throw new Error(`${label}: Der RP-Name muss 2 bis 40 Zeichen ohne Steuerzeichen enthalten.`);
    }
    const countText = parts.length === 1 ? '1' : parts[1].trim();
    if (CONTROL.test(parts[1] ?? '') || !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(countText)) {
      throw new Error(`${label}: Die Losanzahl muss eine ganze Zahl von 1 bis 100 sein.`);
    }
    entries.push({ name, count: Number(countText) });
  }
  if (!entries.length) throw new Error('Trage mindestens einen RP-Namen in die Sammelliste ein.');
  return entries;
}

export function addBulkTickets(state, input) {
  const entries = parseBulkEntries(input);
  let result = normalizeState(state);
  if (result.lastDraw) throw new Error('Diese Runde wurde bereits gezogen. Starte zuerst eine neue Runde.');
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (result.tickets.length + total > 10000) throw new Error('Pro Runde sind höchstens 10000 Lose möglich. Die Sammelliste wurde nicht übernommen.');
  if (result.nextTicketNumber + total - 1 > 1000000000) throw new Error('Die höchste Losnummer ist erreicht. Starte eine neue Runde.');
  // Only the final state is returned. Failed validation or random-ID generation
  // cannot expose a partially imported list or mutate the caller's state.
  for (const entry of entries) result = addTickets(result, entry.name, entry.count);
  return result;
}

function csvCell(value) {
  let text = String(value);
  // Quoting alone does not stop spreadsheet formulas. Prefix dangerous string
  // cells before standard CSV escaping, including formulas after whitespace.
  if (typeof value === 'string' && /^\s*[=+\-@\u0000-\u001f\u007f-\u009f]/u.test(text)) text = `'${text}`;
  return /[;"\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function ticketsCsv(state) {
  const lines = ['Runde;Losnummer;RP-Name;Loswert;Währung;Status'];
  for (const ticket of state.tickets) {
    const status = !state.lastDraw ? 'Offen' : ticket.id === state.lastDraw.winner.id ? 'Gewonnen' : 'Kein Gewinn';
    const cells = [state.round, ticket.number, ticket.name, state.settings.ticketPrice, state.settings.currency, status];
    lines.push(cells.map(csvCell).join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function announcementText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .replaceAll('@', '＠')
    .replaceAll('`', '´')
    .replaceAll('<', '‹')
    .replaceAll('>', '›')
    .replace(/([\\*_~|[\]])/gu, '\\$1')
    .trim();
}

export function announcement(draw) {
  if (!draw?.winner) throw new Error('Für die Bekanntgabe wird eine abgeschlossene Ziehung benötigt.');
  return [
    `🎉 Sercan´s Lotterie · ${announcementText(draw.roundTitle)}`,
    `Runde #${String(draw.round).padStart(2, '0')}`,
    `Gewinner: ${announcementText(draw.winner.name)}`,
    `Gewinnlos: #${String(draw.winner.number).padStart(3, '0')} · ${number.format(draw.ticketCount)} ${draw.ticketCount === 1 ? 'Los' : 'Lose'} im Topf`,
    `Jackpot: ${number.format(draw.jackpot)} ${announcementText(draw.currency)}`,
    'Glückwunsch! Alles bleibt im Roleplay.',
  ].join('\n');
}

function folded(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-DE').replaceAll('ß', 'ss');
}

export function filteredParticipants(tickets, query = '', sort = 'name') {
  if (sort !== 'name' && sort !== 'tickets') throw new Error('Diese Teilnehmersortierung wird nicht unterstützt.');
  const groups = new Map();
  for (const ticket of tickets) {
    if (!groups.has(ticket.name)) groups.set(ticket.name, []);
    groups.get(ticket.name).push(ticket);
  }
  const search = folded(query ?? '').trim();
  const result = Array.from(groups, ([name, entries]) => ({ name, tickets: entries }))
    .filter(group => folded(group.name).includes(search));
  const compareName = (a, b) => nameOrder.compare(a.name, b.name) || exactNameOrder.compare(a.name, b.name);
  result.sort((a, b) => (sort === 'tickets' ? b.tickets.length - a.tickets.length : 0) || compareName(a, b));
  return result;
}
