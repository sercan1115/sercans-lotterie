const MAX_TICKETS = 10000;
const MAX_NUMBER = 1000000000;
const MAX_JACKPOT = MAX_NUMBER * (MAX_TICKETS + 1);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function fail(message) { throw new Error(message); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(`${label} ist ungültig.`);
  }
  return value;
}
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${label} muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
  }
  return value;
}
function text(value, min, max, label) {
  if (typeof value !== 'string' || CONTROL.test(value)) fail(`${label} ist ungültig.`);
  const result = value.trim();
  if (result.length < min || result.length > max) {
    fail(`${label} muss ${min} bis ${max} Zeichen enthalten.`);
  }
  return result;
}
function timestamp(value) {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail('Das gespeicherte Datum ist ungültig.');
  }
  return new Date(value).toISOString();
}
function settings(value) {
  object(value, 'Die Einstellungen');
  return {
    ticketPrice: integer(value.ticketPrice, 1, MAX_NUMBER, 'Der Lospreis'),
    seedJackpot: integer(value.seedJackpot, 0, MAX_NUMBER, 'Der Startjackpot'),
    title: text(value.title, 1, 60, 'Der Rundenname'),
    currency: text(value.currency, 1, 12, 'Die Spielwährung'),
  };
}
function ticket(value) {
  object(value, 'Das Los');
  return {
    id: text(value.id, 1, 100, 'Die Los-ID'),
    number: integer(value.number, 1, MAX_NUMBER, 'Die Losnummer'),
    name: text(value.name, 2, 40, 'Der RP-Name'),
    createdAt: timestamp(value.createdAt),
  };
}
function drawRecord(value, currentRound) {
  object(value, 'Die Ziehung');
  return {
    id: text(value.id, 1, 100, 'Die Ziehungs-ID'),
    round: integer(value.round, 1, currentRound, 'Die Rundennummer'),
    roundTitle: text(value.roundTitle, 1, 60, 'Der Rundenname'),
    winner: ticket(value.winner),
    ticketCount: integer(value.ticketCount, 1, MAX_TICKETS, 'Die Losanzahl'),
    jackpot: integer(value.jackpot, 1, MAX_JACKPOT, 'Der Jackpot'),
    currency: text(value.currency, 1, 12, 'Die Spielwährung'),
    drawnAt: timestamp(value.drawnAt),
  };
}
function randomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) fail('Sicherer Zufall ist in diesem Browser nicht verfügbar.');
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
}
function uniqueId(used) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = randomId();
    if (!used.has(id)) return id;
  }
  fail('Es konnte keine eindeutige ID erzeugt werden. Bitte erneut versuchen.');
}
function randomIndex(length) {
  if (!globalThis.crypto?.getRandomValues) fail('Sicherer Zufall ist in diesem Browser nicht verfügbar.');
  const range = 0x100000000;
  const limit = range - (range % length);
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % length;
}
function requireOpen(state) {
  if (state.lastDraw) fail('Diese Runde wurde bereits gezogen. Starte zuerst eine neue Runde.');
}

export function createState() {
  return {
    version: 1,
    round: 1,
    nextTicketNumber: 1,
    settings: { ticketPrice: 1000, seedJackpot: 50000, title: 'Freitagsziehung', currency: 'RP $' },
    tickets: [],
    history: [],
    lastDraw: null,
  };
}

export function normalizeState(data) {
  object(data, 'Die Sicherung');
  if (data.version !== 1) fail('Diese Sicherungsversion wird nicht unterstützt.');
  const round = integer(data.round, 1, MAX_NUMBER, 'Die Rundennummer');
  const config = settings(data.settings);
  if (!Array.isArray(data.tickets) || data.tickets.length > MAX_TICKETS) fail('Die Losliste ist ungültig oder zu groß.');
  if (!Array.isArray(data.history) || data.history.length > 100) fail('Die Ziehungshistorie ist ungültig oder zu groß.');
  const tickets = data.tickets.map(ticket);
  const ids = new Set();
  const numbers = new Set();
  for (const entry of tickets) {
    if (ids.has(entry.id) || numbers.has(entry.number)) fail('Die Sicherung enthält doppelte Lose.');
    ids.add(entry.id);
    numbers.add(entry.number);
  }
  const largest = tickets.reduce((max, entry) => Math.max(max, entry.number), 0);
  const nextTicketNumber = integer(data.nextTicketNumber ?? largest + 1, 1, MAX_NUMBER + 1, 'Die nächste Losnummer');
  if (nextTicketNumber <= largest) fail('Die nächste Losnummer ist ungültig.');
  const history = data.history.map(value => drawRecord(value, round));
  const drawIds = new Set();
  let previousRound = round + 1;
  for (const draw of history) {
    if (drawIds.has(draw.id) || draw.round >= previousRound) fail('Die Reihenfolge der Ziehungshistorie ist ungültig.');
    drawIds.add(draw.id);
    previousRound = draw.round;
  }
  if (data.lastDraw !== null && data.lastDraw === undefined) fail('Das Ziehungsergebnis fehlt in der Sicherung.');
  const lastDraw = data.lastDraw === null ? null : drawRecord(data.lastDraw, round);
  if (lastDraw) {
    if (lastDraw.round !== round || !history[0] || JSON.stringify(lastDraw) !== JSON.stringify(history[0])) {
      fail('Das Ziehungsergebnis passt nicht zur aktuellen Runde.');
    }
    const winner = tickets.find(entry => entry.id === lastDraw.winner.id);
    if (!winner || JSON.stringify(winner) !== JSON.stringify(lastDraw.winner) ||
        lastDraw.ticketCount !== tickets.length || lastDraw.roundTitle !== config.title ||
        lastDraw.currency !== config.currency ||
        lastDraw.jackpot !== config.seedJackpot + tickets.length * config.ticketPrice) {
      fail('Das Ziehungsergebnis und die Lose passen nicht zusammen.');
    }
  } else if (history[0]?.round === round) {
    fail('Eine gezogene Runde muss ihr Ergebnis behalten.');
  }
  return { version: 1, round, nextTicketNumber, settings: config, tickets, history, lastDraw };
}

export function jackpot(state) {
  return state.settings.seedJackpot + state.tickets.length * state.settings.ticketPrice;
}

export function addTickets(state, name, count) {
  const result = normalizeState(state);
  requireOpen(result);
  const cleanName = text(name, 2, 40, 'Der RP-Name');
  integer(count, 1, 100, 'Die Losanzahl');
  if (result.tickets.length + count > MAX_TICKETS) fail('Pro Runde sind höchstens 10000 Lose möglich.');
  if (result.nextTicketNumber + count - 1 > MAX_NUMBER) fail('Die höchste Losnummer ist erreicht. Starte eine neue Runde.');
  const used = new Set(result.tickets.map(entry => entry.id));
  const createdAt = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    const id = uniqueId(used);
    used.add(id);
    result.tickets.push({ id, number: result.nextTicketNumber++, name: cleanName, createdAt });
  }
  return result;
}

export function removeTicket(state, id) {
  const result = normalizeState(state);
  requireOpen(result);
  const index = result.tickets.findIndex(entry => entry.id === id);
  if (index < 0) fail('Dieses Los wurde nicht gefunden.');
  result.tickets.splice(index, 1);
  return result;
}

export function drawWinner(state) {
  const result = normalizeState(state);
  requireOpen(result);
  if (!result.tickets.length) fail('Trage zuerst mindestens ein Los ein.');
  const winner = { ...result.tickets[randomIndex(result.tickets.length)] };
  const draw = {
    id: uniqueId(new Set(result.history.map(entry => entry.id))),
    round: result.round,
    roundTitle: result.settings.title,
    winner,
    ticketCount: result.tickets.length,
    jackpot: jackpot(result),
    currency: result.settings.currency,
    drawnAt: new Date().toISOString(),
  };
  result.lastDraw = draw;
  result.history = [draw, ...result.history].slice(0, 100);
  return result;
}

export function nextRound(state) {
  const result = normalizeState(state);
  if (result.round === MAX_NUMBER) fail('Die höchste Rundennummer ist erreicht.');
  return { ...result, round: result.round + 1, nextTicketNumber: 1, tickets: [], lastDraw: null };
}

export function updateSettings(state, partial) {
  const result = normalizeState(state);
  requireOpen(result);
  object(partial, 'Die Einstellungen');
  const allowed = ['ticketPrice', 'seedJackpot', 'title', 'currency'];
  if (Object.keys(partial).some(key => !allowed.includes(key))) fail('Diese Einstellung wird nicht unterstützt.');
  result.settings = settings({ ...result.settings, ...partial });
  return result;
}
