import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addTickets, drawWinner, updateSettings } from '../dist/engine.mjs';
import { parseBulkEntries, addBulkTickets, ticketsCsv, announcement, filteredParticipants } from '../dist/round-tools.mjs';

test('Sammelliste verarbeitet Namen, Mengen, Leerzeilen und Windows-Zeilenumbrüche', () => {
  assert.deepEqual(parseBulkEntries('\uFEFF Sercan Kaya ; 3\r\n\r\nMia Müller\r\nJonas Weber;100\n'), [
    { name: 'Sercan Kaya', count: 3 },
    { name: 'Mia Müller', count: 1 },
    { name: 'Jonas Weber', count: 100 },
  ]);
  assert.equal(parseBulkEntries(Array.from({ length: 100 }, (_, i) => `Spieler ${i};1`).join('\n')).length, 100);
});

test('Ungültige Sammellisten nennen die ursprüngliche Zeilennummer', () => {
  for (const line of ['X;1', 'Name;0', 'Name;101', 'Name;-1', 'Name;1.5', 'Name;1e2', 'Name;01', 'Name;', 'Name;2;3', 'Name\t;2', 'Name;\t2']) {
    assert.throws(() => parseBulkEntries(`\nGültiger Name;1\n${line}`), /Zeile 3:/u);
  }
  assert.throws(() => parseBulkEntries('x'.repeat(41)), /Zeile 1:/u);
  assert.throws(() => parseBulkEntries('\n \r\n'), /mindestens/u);
  assert.throws(() => parseBulkEntries(42), /Text/u);
  assert.throws(() => parseBulkEntries(Array.from({ length: 101 }, () => 'Spieler;1').join('\n')), /Zeile 101:/u);
});

test('Sammelvergabe ist atomar und beachtet Rundensperre und Kapazität', () => {
  const source = addTickets(createState(), 'Vorhandener Spieler', 1);
  const before = structuredClone(source);
  const result = addBulkTickets(source, 'Sercan Kaya;3\nMia Müller;2');
  assert.deepEqual(source, before);
  assert.equal(result.tickets.length, 6);
  assert.deepEqual(result.tickets.map(ticket => ticket.number), [1, 2, 3, 4, 5, 6]);
  assert.throws(() => addBulkTickets(source, 'Sercan Kaya;3\nMia Müller;ungültig'), /Zeile 2:/u);
  assert.deepEqual(source, before);
  assert.throws(() => addBulkTickets(drawWinner(source), 'Sercan Kaya;1'), /bereits gezogen/u);
  assert.throws(() => addBulkTickets(source, Array.from({ length: 100 }, (_, i) => `Spieler ${i};100`).join('\n')), /10000/u);
  assert.deepEqual(source, before);
  const atLimit = { ...createState(), nextTicketNumber: 1000000000 };
  assert.throws(() => addBulkTickets(atLimit, 'Sercan Kaya;2'), /Losnummer/u);
  assert.equal(atLimit.tickets.length, 0);
});

test('CSV exportiert BOM, Semikolonspalten, Anführungszeichen und Gewinnerstatus', () => {
  let state = addTickets(createState(), 'Mia "Müller";RP', 1);
  state = addTickets(state, 'Sercan Kaya', 1);
  const csv = ticketsCsv(state);
  assert.ok(csv.startsWith('\uFEFFRunde;Losnummer;RP-Name;Loswert;Währung;Status\r\n'));
  assert.ok(csv.includes('1;1;"Mia ""Müller"";RP";1000;RP $;Offen\r\n'));
  const drawn = ticketsCsv(drawWinner(state));
  assert.equal((drawn.match(/;Gewonnen\r\n/gu) || []).length, 1);
  assert.equal((drawn.match(/;Kein Gewinn\r\n/gu) || []).length, 1);
});

test('CSV entschärft Formelanfänge einschließlich führendem Leerraum und Steuerzeichen', () => {
  const source = addTickets(createState(), 'Sercan Kaya', 1);
  for (const name of ['=1+1', '+SUM(1)', '-1+2', '@SUM(A1)', '  =1+1', '\tName', '\n=1+1']) {
    const state = { ...source, tickets: [{ ...source.tickets[0], name }] };
    const csv = ticketsCsv(state);
    const escaped = `'${name}`.replaceAll('"', '""');
    assert.ok(csv.includes(escaped), `Formelzelle wurde nicht entschärft: ${JSON.stringify(name)}`);
  }
  const currency = updateSettings(source, { currency: '=2+2' });
  assert.ok(ticketsCsv(currency).includes(";'=2+2;Offen"));
});

test('Teilnehmer filtern deutsche Namen und sortieren Gruppen ohne Eingabemutation', () => {
  const state = addBulkTickets(createState(), 'Zoe Straße;2\nMia Müller;3\nAnna Adler;2\nÄnne Berg;1');
  const before = structuredClone(state.tickets);
  assert.deepEqual(filteredParticipants(state.tickets, '').map(group => group.name), ['Anna Adler', 'Änne Berg', 'Mia Müller', 'Zoe Straße']);
  assert.equal(filteredParticipants(state.tickets, 'MULLER')[0].tickets.length, 3);
  assert.equal(filteredParticipants(state.tickets, 'STRASSE')[0].name, 'Zoe Straße');
  assert.deepEqual(filteredParticipants(state.tickets, '', 'tickets').map(group => group.name), ['Mia Müller', 'Anna Adler', 'Zoe Straße', 'Änne Berg']);
  assert.deepEqual(filteredParticipants(state.tickets, 'unbekannt'), []);
  assert.deepEqual(filteredParticipants([], ''), []);
  assert.throws(() => filteredParticipants(state.tickets, '', 'unknown'), /Sortierung|sortierung/u);
  assert.deepEqual(state.tickets, before);
});

test('Bekanntgabe enthält Rundendaten und verhindert Discord-Mentions und Codeblöcke', () => {
  const state = updateSettings(addTickets(createState(), '@everyone `RP` <@123> **Mia**', 1), {
    title: '@here Freitagsziehung', currency: 'RP $',
  });
  const draw = drawWinner(state).lastDraw;
  const copy = announcement(draw);
  assert.ok(copy.includes('Freitagsziehung'));
  assert.ok(copy.includes('Runde #01'));
  assert.ok(copy.includes('Gewinnlos: #001'));
  assert.ok(copy.includes('Jackpot: 51.000 RP $'));
  assert.ok(copy.includes('＠everyone'));
  assert.ok(copy.includes('\\*\\*Mia\\*\\*'));
  assert.ok(!copy.includes('@'));
  assert.ok(!copy.includes('`'));
  assert.ok(!copy.includes('<'));
  assert.throws(() => announcement(null), /abgeschlossene Ziehung/u);
});
