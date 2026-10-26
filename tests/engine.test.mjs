import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addTickets, removeTicket, drawWinner, nextRound, jackpot, normalizeState, updateSettings } from '../dist/engine.mjs';

test('Neue Runde, Jackpot und unveränderliche Lose', () => {
  const original = createState();
  const before = structuredClone(original);
  const state = addTickets(original, '  Sercan Kaya  ', 3);
  assert.deepEqual(original, before);
  assert.deepEqual(state.tickets.map(entry => entry.number), [1, 2, 3]);
  assert.equal(new Set(state.tickets.map(entry => entry.id)).size, 3);
  assert.ok(state.tickets.every(entry => entry.name === 'Sercan Kaya'));
  assert.equal(jackpot(state), 53000);
  const removed = removeTicket(state, state.tickets[2].id);
  const added = addTickets(removed, 'Anderer Spieler', 1);
  assert.equal(added.tickets.at(-1).number, 4);
  assert.equal(state.tickets.length, 3);
});

test('Eingaben und sichere Zahlen werden validiert', () => {
  for (const name of ['', 'x', 'x'.repeat(41), 'Test\nName', '<\u0000>']) {
    assert.throws(() => addTickets(createState(), name, 1));
  }
  for (const count of [0, -1, 1.5, 101, NaN, Infinity, '2']) {
    assert.throws(() => addTickets(createState(), 'Sercan', count));
  }
  assert.throws(() => updateSettings(createState(), { ticketPrice: 0 }));
  assert.throws(() => updateSettings(createState(), { seedJackpot: -1 }));
  assert.throws(() => updateSettings(createState(), { ticketPrice: 1000000001 }));
  assert.throws(() => updateSettings(createState(), { unknown: true }));
  assert.throws(() => removeTicket(createState(), 'unknown'));
  const state = updateSettings(createState(), { seedJackpot: 0, ticketPrice: 25, title: 'Samstagsrunde' });
  assert.equal(jackpot(addTickets(state, 'Sercan', 4)), 100);
});

test('Ziehung verwendet unverzerrten Zufall und verwirft den Randbereich', () => {
  const state = addTickets(createState(), 'Sercan', 3);
  const originalRandom = crypto.getRandomValues;
  let calls = 0;
  const values = [0xffffffff, 2];
  crypto.getRandomValues = array => { calls++; array[0] = values.shift(); return array; };
  try {
    const result = drawWinner(state);
    assert.equal(calls, 2);
    assert.equal(result.lastDraw.winner.id, state.tickets[2].id);
    assert.equal(result.lastDraw.jackpot, 53000);
    assert.equal(result.history.length, 1);
    assert.equal(state.lastDraw, null);
    assert.deepEqual(normalizeState(result), result);
  } finally { crypto.getRandomValues = originalRandom; }
});

test('Leere und gezogene Runden sind gesperrt; neue Runde behält Historie', () => {
  assert.throws(() => drawWinner(createState()));
  const result = drawWinner(addTickets(createState(), 'Sercan', 1));
  assert.equal(result.lastDraw.winner.number, 1);
  assert.throws(() => drawWinner(result));
  assert.throws(() => addTickets(result, 'Weiterer Spieler', 1));
  assert.throws(() => removeTicket(result, result.tickets[0].id));
  assert.throws(() => updateSettings(result, { title: 'Neu' }));
  const next = nextRound(result);
  assert.equal(next.round, 2);
  assert.equal(next.tickets.length, 0);
  assert.equal(next.lastDraw, null);
  assert.equal(next.history.length, 1);
  assert.equal(addTickets(next, 'Neuer Spieler', 1).tickets[0].number, 1);
  assert.deepEqual(normalizeState(next), next);
});

test('Import akzeptiert gültige JSON-Sicherung und verwirft beschädigte Zustände', () => {
  const saved = drawWinner(addTickets(createState(), 'Sercan', 2));
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(saved))), saved);
  const corruptions = [
    state => { state.version = 2; },
    state => { state.round = 0; },
    state => { state.tickets[0].number = 0; },
    state => { state.tickets[0].createdAt = 'kein Datum'; },
    state => { state.tickets[1].id = state.tickets[0].id; },
    state => { state.tickets[1].number = state.tickets[0].number; },
    state => { state.nextTicketNumber = 1; },
    state => { state.lastDraw.winner.name = 'Manipuliert'; },
    state => { state.lastDraw = null; },
    state => { state.history = []; },
    state => { state.settings.seedJackpot++; },
    state => { state.settings.currency = 'Credits'; },
    state => { state.lastDraw.currency = ''; },
    state => { state.history[0].round = 2; },
  ];
  for (const corrupt of corruptions) {
    const value = structuredClone(saved);
    corrupt(value);
    assert.throws(() => normalizeState(value));
  }
  assert.throws(() => normalizeState(null));
  assert.throws(() => normalizeState([]));
  assert.throws(() => normalizeState({ ...createState(), history: new Array(101).fill(saved.lastDraw) }));
});

test('Los- und Historienlimits sowie rückwärtskompatible Nummerierung', () => {
  let state = createState();
  for (let i = 0; i < 100; i++) state = addTickets(state, 'Sercan', 100);
  assert.equal(state.tickets.length, 10000);
  assert.throws(() => addTickets(state, 'Sercan', 1));
  const imported = structuredClone(state);
  delete imported.nextTicketNumber;
  assert.equal(normalizeState(imported).nextTicketNumber, 10001);
  let historical = createState();
  for (let i = 0; i < 102; i++) historical = nextRound(drawWinner(addTickets(historical, 'Sercan', 1)));
  assert.equal(historical.history.length, 100);
  assert.equal(historical.history[0].round, 102);
  assert.equal(historical.history.at(-1).round, 3);
  assert.deepEqual(normalizeState(historical), historical);
});

test('Import verwirft doppelte Ziehungs-IDs und wiederholte Runden', () => {
  let state = drawWinner(addTickets(createState(), 'Sercan', 1));
  state = drawWinner(addTickets(nextRound(state), 'Sercan', 1));
  assert.equal(state.history.length, 2);
  const duplicateId = structuredClone(state);
  duplicateId.history[1].id = duplicateId.history[0].id;
  assert.throws(() => normalizeState(duplicateId));
  const duplicateRound = structuredClone(state);
  duplicateRound.history[1].round = duplicateRound.history[0].round;
  assert.throws(() => normalizeState(duplicateRound));
  const removedWinner = structuredClone(state);
  removedWinner.tickets = [];
  assert.throws(() => normalizeState(removedWinner));
});

test('Historische Jackpots behalten die Spielwährung ihrer Runde', () => {
  const first = drawWinner(addTickets(createState(), 'Sercan', 1));
  assert.equal(first.lastDraw.currency, 'RP $');
  const next = updateSettings(nextRound(first), { currency: 'Credits' });
  assert.equal(next.history[0].currency, 'RP $');
  const second = drawWinner(addTickets(next, 'Sercan', 1));
  assert.equal(second.lastDraw.currency, 'Credits');
  assert.deepEqual(second.history.map(draw => draw.currency), ['Credits', 'RP $']);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(second))), second);
});
