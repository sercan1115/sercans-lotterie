import { createState, normalizeState, addTickets, removeTicket, drawWinner, nextRound, jackpot, updateSettings } from './engine.mjs';
import { parseBulkEntries, addBulkTickets, filteredParticipants, ticketsCsv, announcement } from './round-tools.mjs';
import { createEffects } from './effects.mjs';

const $ = selector => document.querySelector(selector);
const storageKey = 'sercans-lotterie:v1';
const number = new Intl.NumberFormat('de-DE');
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const effects = createEffects({ motionToggle: $('#motion-toggle'), soundToggle: $('#sound-toggle') });
let state = createState();
let busy = false;
let storageBlocked = false;
let toastTimer;
let confirmCallback;
let animationTimer;
let revealTimer;
let displayedJackpot;
let shownWinner;
let confirmFingerprint;
let copyTimer;

function showStorageWarning(message) {
  $('#storage-warning').textContent = message;
  $('#storage-warning').hidden = false;
  $('.local-status').firstChild?.remove();
  $('.local-status').textContent = 'Nur in dieser Sitzung';
}

try {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) state = normalizeState(JSON.parse(saved));
} catch {
  storageBlocked = true;
  showStorageWarning('Der Browserspeicher ist nicht verfügbar oder enthält ungültige Daten. Änderungen bleiben in dieser Sitzung. Bitte exportiere eine Sicherung.');
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  const target = $('#toast');
  target.textContent = message;
  target.classList.toggle('error', error);
  target.hidden = false;
  toastTimer = setTimeout(() => { target.hidden = true; }, error ? 6500 : 3500);
}

function commit(next) {
  state = next;
  if (!storageBlocked) {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch {
      storageBlocked = true;
      showStorageWarning('Deine Änderungen können nicht dauerhaft gespeichert werden. Bitte exportiere vor dem Schließen eine Sicherung.');
    }
  }
  render();
}

async function act(action) {
  if (busy) return;
  const run = () => {
    if (busy) return;
    // Read the latest state inside a cross-tab lock before making any changes.
    if (!storageBlocked) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) state = normalizeState(JSON.parse(saved));
      } catch {
        storageBlocked = true;
        showStorageWarning('Der Browserspeicher konnte nicht gelesen werden. Bitte exportiere deine Runde als Sicherung.');
      }
    }
    render();
    return action();
  };
  try {
    if (navigator.locks) await navigator.locks.request(storageKey, run);
    else run();
  } catch (error) { toast(error.message || 'Das hat leider nicht geklappt.', true); }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${id}`);
  svg.append(use);
  return svg;
}

const money = (value, currency = state.settings.currency) => `${number.format(value)} ${currency}`;
const ticketNumber = value => String(value).padStart(3, '0');

function renderParticipants() {
  const list = $('#participant-list');
  const query = $('#participant-search').value;
  const groups = filteredParticipants(state.tickets, query, $('#participant-sort').value);
  const total = new Set(state.tickets.map(ticket => ticket.name)).size;
  $('#participant-count').textContent = query.trim() ? `${groups.length}/${total}` : number.format(total);
  if (!state.tickets.length) {
    list.replaceChildren();
    const empty = element('div', 'empty-state');
    const emptyIcon = element('span', 'empty-icon');
    emptyIcon.append(icon('ticket'));
    empty.append(emptyIcon, element('strong', '', 'Hier ist noch Platz für Glück.'));
    const info = element('p', '', 'Füge den ersten RP-Namen hinzu.');
    info.append(document.createElement('br'), document.createTextNode('Jedes Los ist eine neue Chance.'));
    empty.append(info);
    list.append(empty);
    return;
  }
  if (!groups.length) {
    const empty = element('div', 'no-results');
    empty.append(element('strong', '', 'Kein RP-Name gefunden.'), document.createTextNode('Versuche einen anderen Namen oder leere die Suche.'));
    list.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const { name, tickets } of groups) {
    const row = element('div', 'participant');
    const initials = name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('de');
    const avatar = element('span', 'avatar', initials);
    avatar.setAttribute('aria-hidden', 'true');
    const info = element('div', 'player-info');
    const ticketText = `${tickets.length} ${tickets.length === 1 ? 'Los' : 'Lose'} · ${tickets.slice(0, 4).map(t => `#${ticketNumber(t.number)}`).join(', ')}${tickets.length > 4 ? ` +${tickets.length - 4}` : ''}`;
    info.append(element('strong', '', name), element('span', '', ticketText));
    const chanceValue = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(tickets.length / state.tickets.length * 100);
    const chance = element('span', 'chance', `${chanceValue} %`);
    chance.title = 'Gewinnchance';
    const remove = element('button', 'icon-button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Ein Los von ${name} entfernen`);
    remove.title = 'Ein Los entfernen';
    remove.disabled = !!state.lastDraw || busy;
    remove.append(icon('trash'));
    remove.addEventListener('click', () => act(() => {
      commit(removeTicket(state, tickets[tickets.length - 1].id));
      toast(`Ein Los von ${name} entfernt.`);
    }));
    row.append(avatar, info, chance, remove);
    fragment.append(row);
  }
  list.replaceChildren(fragment);
}

function renderHistory() {
  if (!state.history.length) return renderEmptyHistory();
  const fragment = document.createDocumentFragment();
  for (const draw of state.history) {
    const row = element('article', 'history-row');
    const trophy = element('span', 'history-trophy');
    trophy.append(icon('trophy'));
    const player = element('div', 'history-player');
    player.append(element('strong', '', draw.winner.name), element('span', '', `Runde #${String(draw.round).padStart(2, '0')} · Los #${ticketNumber(draw.winner.number)} · ${date.format(new Date(draw.drawnAt))}`));
    const amount = element('div', 'history-amount', money(draw.jackpot, draw.currency));
    amount.append(element('small', '', draw.roundTitle));
    const copy = element('button', 'icon-button copy-history');
    copy.type = 'button';
    copy.title = 'Gewinnernachricht kopieren';
    copy.setAttribute('aria-label', `Ergebnis der Runde ${draw.round} kopieren`);
    copy.append(icon('copy'));
    copy.addEventListener('click', () => copyAnnouncement(draw));
    row.append(trophy, player, amount, copy);
    fragment.append(row);
  }
  $('#history-list').replaceChildren(fragment);
}

function render() {
  const locked = !!state.lastDraw;
  $('#round-number').textContent = `#${String(state.round).padStart(2, '0')}`;
  $('#ticket-total').textContent = `${number.format(state.tickets.length)} ${state.tickets.length === 1 ? 'Los' : 'Lose'}`;
  const currentJackpot = jackpot(state);
  if (displayedJackpot !== currentJackpot) {
    effects.animateNumber($('#jackpot-number'), displayedJackpot ?? currentJackpot, currentJackpot, value => number.format(value));
    displayedJackpot = currentJackpot;
  }
  $('#jackpot-currency').textContent = state.settings.currency;
  $('#price-value').textContent = money(state.settings.ticketPrice);
  $('#pot-value').textContent = number.format(state.tickets.length);
  $('#round-title').textContent = state.settings.title;
  $('#draw-button').disabled = busy || (!locked && !state.tickets.length);
  $('#draw-button span').textContent = locked ? 'Gewinner ansehen' : 'Gewinner ziehen';
  $('#draw-hint').textContent = locked ? 'Diese Runde ist abgeschlossen. Bereit für eine neue?' : state.tickets.length ? 'Ein Klick. Ein Los. Euer großer Moment.' : 'Deine Ziehung startet ab dem ersten Los.';
  for (const input of $('#ticket-form').elements) input.disabled = locked || busy;
  $('#next-round').disabled = busy;
  $('#import-button').disabled = busy;
  $('#bulk-open').disabled = locked || busy;
  $('#csv-button').disabled = !state.tickets.length || busy;
  for (const button of document.querySelectorAll('[data-count]')) {
    button.disabled = locked || busy;
    button.setAttribute('aria-pressed', String(Number(button.dataset.count) === Number($('#ticket-count').value)));
  }
  renderParticipants();
  renderHistory();
}

$('#ticket-form').addEventListener('submit', event => {
  event.preventDefault();
  effects.unlockSound();
  act(() => {
    const name = $('#player-name').value.trim();
    const count = Number($('#ticket-count').value);
    commit(addTickets(state, name, count));
    toast(`${count} ${count === 1 ? 'Los' : 'Lose'} für ${name} im Topf.`);
    $('#player-name').value = '';
    $('#ticket-count').value = '1';
    updateQuickCounts();
    $('#player-name').focus();
    effects.pulse($('.jackpot-panel'));
    effects.sound('add');
  });
});

function updateQuickCounts() {
  for (const button of document.querySelectorAll('[data-count]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.count) === Number($('#ticket-count').value)));
  }
}
for (const button of document.querySelectorAll('[data-count]')) {
  button.addEventListener('click', () => {
    $('#ticket-count').value = button.dataset.count;
    updateQuickCounts();
    $('#player-name').focus();
  });
}
$('#ticket-count').addEventListener('input', updateQuickCounts);
$('#participant-search').addEventListener('input', renderParticipants);
$('#participant-sort').addEventListener('change', renderParticipants);

function updateBulkPreview() {
  const summary = $('#bulk-summary');
  try {
    const entries = parseBulkEntries($('#bulk-entries').value);
    const count = entries.reduce((sum, entry) => sum + entry.count, 0);
    if (state.tickets.length + count > 10000) throw new Error('In den Lostopf passen höchstens 10.000 Lose.');
    summary.textContent = `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'} · ${number.format(count)} neue ${count === 1 ? 'Los' : 'Lose'} · ${money(count * state.settings.ticketPrice)} zusätzlich im Jackpot`;
    summary.classList.remove('is-error');
    $('#bulk-submit').disabled = !entries.length;
  } catch (error) {
    summary.textContent = $('#bulk-entries').value.trim() ? error.message : 'Bis zu 100 Einträge auf einmal. Pro Eintrag maximal 100 Lose.';
    summary.classList.toggle('is-error', !!$('#bulk-entries').value.trim());
    $('#bulk-submit').disabled = true;
  }
}
$('#bulk-open').addEventListener('click', () => act(() => {
  if (state.lastDraw) return toast('Starte zuerst eine neue Runde.', true);
  updateBulkPreview();
  $('#bulk-dialog').showModal();
}));
$('#bulk-entries').addEventListener('input', updateBulkPreview);
$('#bulk-form').addEventListener('submit', event => {
  event.preventDefault();
  effects.unlockSound();
  act(() => {
    const previousCount = state.tickets.length;
    commit(addBulkTickets(state, $('#bulk-entries').value));
    $('#bulk-dialog').close();
    $('#bulk-entries').value = '';
    $('#participant-search').value = '';
    renderParticipants();
    toast(`${number.format(state.tickets.length - previousCount)} neue Lose für deine Crew im Topf.`);
    effects.pulse($('.jackpot-panel'));
    effects.sound('add');
  });
});

for (const button of document.querySelectorAll('.settings-open')) {
  button.addEventListener('click', () => act(() => {
    if (state.lastDraw) return toast('Die Runde ist abgeschlossen. Starte zuerst eine neue Runde.', true);
    $('#setting-title').value = state.settings.title;
    $('#setting-price').value = state.settings.ticketPrice;
    $('#setting-seed').value = state.settings.seedJackpot;
    $('#setting-currency').value = state.settings.currency;
    $('#settings-dialog').showModal();
  }));
}

$('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  act(() => {
    commit(updateSettings(state, {
      title: $('#setting-title').value,
      ticketPrice: Number($('#setting-price').value),
      seedJackpot: Number($('#setting-seed').value),
      currency: $('#setting-currency').value,
    }));
    $('#settings-dialog').close();
    toast('Deine Runde ist eingerichtet. Viel Glück!');
  });
});

function askConfirmation(title, description, actionLabel, callback) {
  $('#confirm-heading').textContent = title;
  $('#confirm-description').textContent = description;
  $('#confirm-action').textContent = actionLabel;
  confirmCallback = callback;
  confirmFingerprint = JSON.stringify(state);
  $('#confirm-dialog').showModal();
}

$('#confirm-action').addEventListener('click', () => {
  const callback = confirmCallback;
  const fingerprint = confirmFingerprint;
  confirmCallback = null;
  $('#confirm-dialog').close();
  act(() => {
    if (fingerprint !== JSON.stringify(state)) throw new Error('Die Runde wurde inzwischen geändert. Bitte prüfe sie und bestätige deine Aktion erneut.');
    callback?.();
  });
});

$('#next-round').addEventListener('click', () => act(() => {
  askConfirmation('Neue Runde starten?', state.tickets.length && !state.lastDraw ? 'Die aktuelle Runde wurde noch nicht gezogen. Alle aktuellen Lose werden entfernt. Exportiere bei Bedarf zuerst eine Sicherung. Bisherige Gewinner bleiben gespeichert.' : 'Der Lostopf wird geleert. Einstellungen und die letzten 100 Gewinner bleiben gespeichert.', 'Neue Runde starten', () => {
    commit(nextRound(state));
    $('#participant-search').value = '';
    renderParticipants();
    toast(`Runde #${String(state.round).padStart(2, '0')} ist eröffnet.`);
    $('#lotterie').scrollIntoView({ behavior: effects.motionEnabled() ? 'smooth' : 'instant' });
  });
}));

function revealWinner(draw, celebrate = false) {
  stopShow();
  shownWinner = draw;
  $('#winner-dialog').dataset.stage = 'winner';
  $('#show-round').textContent = `RUNDE ${String(draw.round).padStart(2, '0')}`;
  $('#winner-heading').textContent = draw.winner.name;
  $('#winner-eyebrow').textContent = 'DAS GLÜCK HAT ENTSCHIEDEN';
  $('#draw-stage').hidden = true;
  $('#winner-ticket').textContent = `Los #${ticketNumber(draw.winner.number)} · Runde #${String(draw.round).padStart(2, '0')} · ${draw.ticketCount} ${draw.ticketCount === 1 ? 'Los' : 'Lose'} im Topf`;
  effects.animateNumber($('#winner-prize-number'), celebrate ? 0 : draw.jackpot, draw.jackpot, value => number.format(value));
  $('#winner-prize-currency').textContent = draw.currency;
  $('#winner-result').hidden = false;
  $('#winner-heading').setAttribute('aria-live', 'polite');
  busy = false;
  render();
  if (celebrate) {
    effects.burst($('#confetti'));
    effects.sound('win');
  }
}

function stopShow() {
  clearTimeout(animationTimer);
  clearTimeout(revealTimer);
}

function playDrawing(draw) {
  const dialog = $('#winner-dialog');
  const tickets = state.tickets;
  const active = () => busy && dialog.open && state.lastDraw?.id === draw.id;
  dialog.dataset.stage = 'countdown';
  $('#show-round').textContent = `RUNDE ${String(draw.round).padStart(2, '0')}`;
  $('#winner-heading').textContent = 'Euer Moment kommt.';
  $('#winner-eyebrow').textContent = 'BEREIT FÜR EIN BISSCHEN GLÜCK?';
  $('#winner-result').hidden = true;
  $('#draw-stage').hidden = false;
  $('#draw-countdown').hidden = false;
  $('#draw-reel').hidden = true;
  $('#draw-progress-bar').style.width = '0%';
  dialog.showModal();
  if (!effects.motionEnabled()) return revealWinner(draw, true);
  let countdown = 3;
  const count = () => {
    if (!active()) return;
    $('#draw-countdown').textContent = String(countdown);
    effects.sound('countdown');
    if (countdown-- > 1) animationTimer = setTimeout(count, 700);
    else animationTimer = setTimeout(mix, 700);
  };
  const mix = () => {
    if (!active()) return;
    dialog.dataset.stage = 'mixing';
    $('#winner-heading').textContent = 'Wer schreibt Geschichte?';
    $('#winner-eyebrow').textContent = 'DIE LOSE WERDEN GEMISCHT';
    $('#draw-countdown').hidden = true;
    $('#draw-reel').hidden = false;
    let frame = 0;
    const totalFrames = 25;
    const roll = () => {
      if (!active()) return;
      const current = tickets[frame % tickets.length];
      $('#rolling-number').textContent = ticketNumber(current.number);
      $('#rolling-name').textContent = current.name;
      $('#draw-progress-bar').style.width = `${(frame + 1) / totalFrames * 100}%`;
      effects.sound('tick');
      frame++;
      if (frame < totalFrames) animationTimer = setTimeout(roll, 40 + frame * 5);
      else revealTimer = setTimeout(() => { if (active()) revealWinner(draw, true); }, 380);
    };
    roll();
  };
  count();
}

$('#draw-button').addEventListener('click', () => {
  effects.unlockSound();
  act(() => {
  effects.reset();
  $('#confetti').replaceChildren();
  if (state.lastDraw) {
    revealWinner(state.lastDraw);
    $('#winner-dialog').showModal();
    return;
  }
  // Persist the result before the visual animation, so reloading never redraws a round.
  const next = drawWinner(state);
  busy = true;
  commit(next);
  playDrawing(state.lastDraw);
  });
});

addEventListener('lottery-effects-change', event => {
  if (busy && !event.detail.motion && state.lastDraw) revealWinner(state.lastDraw, true);
});

async function copyAnnouncement(draw) {
  if (!draw) return;
  const text = announcement(draw);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    toast('Gewinnernachricht kopiert. Bereit für euren RP-Chat!');
    if ($('#winner-dialog').open) {
      const button = $('#copy-winner');
      clearTimeout(copyTimer);
      button.replaceChildren(icon('shield'), document.createTextNode('Kopiert!'));
      copyTimer = setTimeout(() => button.replaceChildren(icon('copy'), document.createTextNode('Ergebnis kopieren')), 2500);
    }
  } catch {
    $('#copy-text').value = text;
    $('#copy-dialog').showModal();
    $('#copy-text').focus();
    $('#copy-text').select();
  }
}
$('#copy-winner').addEventListener('click', () => copyAnnouncement(shownWinner));
$('#celebrate-again').addEventListener('click', () => {
  effects.unlockSound();
  effects.burst($('#confetti'));
  effects.sound('win');
});

for (const button of document.querySelectorAll('.close-dialog')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}
$('#winner-dialog').addEventListener('close', () => {
  stopShow();
  effects.reset();
  busy = false;
  render();
});
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}

$('#export-button').addEventListener('click', () => act(() => {
  downloadFile(JSON.stringify(state, null, 2), 'application/json', `sercans-lotterie-runde-${state.round}-${new Date().toISOString().slice(0, 10)}.json`);
  toast('Deine Sicherung wird heruntergeladen.');
}));

function downloadFile(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#csv-button').addEventListener('click', () => act(() => {
  downloadFile(ticketsCsv(state), 'text/csv;charset=utf-8', `sercans-lotterie-lose-runde-${state.round}.csv`);
  toast('Die Losliste wird als CSV heruntergeladen.');
}));

$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5_000_000) return toast('Die Sicherung darf höchstens 5 MB groß sein.', true);
  try {
    const restored = normalizeState(JSON.parse(await file.text()));
    if (busy) return toast('Bitte importiere die Sicherung nach der laufenden Ziehung erneut.', true);
    askConfirmation('Sicherung wiederherstellen?', `Runde #${restored.round} mit ${restored.tickets.length} Losen und ${restored.history.length} Ziehungen importieren? Die Daten in diesem Browser werden ersetzt. Exportiere bei Bedarf vorher eine Sicherung.`, 'Sicherung importieren', () => {
      storageBlocked = false;
      $('#storage-warning').hidden = true;
      commit(restored);
      if (!storageBlocked) {
        const dot = element('span', 'status-dot');
        $('.local-status').replaceChildren(dot, document.createTextNode(' Lokal gespeichert '), icon('info'));
      }
      // Restore the original empty history when importing an unplayed round.
      if (!restored.history.length) renderEmptyHistory();
      toast('Sicherung wiederhergestellt. Willkommen zurück!');
    });
  } catch (error) {
    toast(`Sicherung nicht importiert: ${error instanceof SyntaxError ? 'Die Datei enthält kein gültiges JSON.' : error.message}`, true);
  }
});

function renderEmptyHistory() {
  const empty = element('div', 'history-empty');
  const copy = element('p');
  copy.append(element('strong', '', 'Der erste große Moment wartet noch.'), document.createElement('br'), document.createTextNode('Nach einer Ziehung findest du hier den Gewinner.'));
  empty.append(icon('trophy'), copy, element('span', '', 'UND VIELLEICHT STEHT HIER BALD DEIN NAME.'));
  $('#history-list').replaceChildren(empty);
}

addEventListener('storage', event => {
  if (event.key !== storageKey || !event.newValue) return;
  try {
    const updated = normalizeState(JSON.parse(localStorage.getItem(storageKey)));
    stopShow();
    effects.reset();
    const wasBusy = busy;
    busy = false;
    if (wasBusy) $('#winner-dialog').close();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    state = updated;
    render();
    if (!state.history.length) renderEmptyHistory();
    toast('Die Runde wurde in einem anderen Tab aktualisiert.');
  } catch { toast('Die Daten aus einem anderen Tab konnten nicht geladen werden.', true); }
});

for (const svg of document.querySelectorAll('svg:not(.svg-symbols)')) svg.setAttribute('aria-hidden', 'true');
render();
