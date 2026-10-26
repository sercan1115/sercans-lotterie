import { createState, normalizeState, addTickets, removeTicket, drawWinner, nextRound, jackpot, updateSettings } from './engine.mjs';

const $ = selector => document.querySelector(selector);
const storageKey = 'sercans-lotterie:v1';
const number = new Intl.NumberFormat('de-DE');
const date = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let state = createState();
let busy = false;
let storageBlocked = false;
let toastTimer;
let confirmCallback;
let animationTimer;
let revealTimer;

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
  const groups = new Map();
  for (const ticket of state.tickets) {
    if (!groups.has(ticket.name)) groups.set(ticket.name, []);
    groups.get(ticket.name).push(ticket);
  }
  $('#participant-count').textContent = number.format(groups.size);
  if (!groups.size) {
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
  const fragment = document.createDocumentFragment();
  for (const [name, tickets] of groups) {
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
    row.append(trophy, player, amount);
    fragment.append(row);
  }
  $('#history-list').replaceChildren(fragment);
}

function render() {
  const locked = !!state.lastDraw;
  $('#round-number').textContent = `#${String(state.round).padStart(2, '0')}`;
  $('#ticket-total').textContent = `${number.format(state.tickets.length)} ${state.tickets.length === 1 ? 'Los' : 'Lose'}`;
  $('#jackpot-amount').replaceChildren(document.createTextNode(`${number.format(jackpot(state))} `), element('span', '', state.settings.currency));
  $('#price-value').textContent = money(state.settings.ticketPrice);
  $('#pot-value').textContent = number.format(state.tickets.length);
  $('#round-title').textContent = state.settings.title;
  $('#draw-button').disabled = busy || (!locked && !state.tickets.length);
  $('#draw-button span').textContent = locked ? 'Gewinner ansehen' : 'Gewinner ziehen';
  $('#draw-hint').textContent = locked ? 'Diese Runde ist abgeschlossen. Bereit für eine neue?' : state.tickets.length ? 'Ein Klick. Ein Los. Euer großer Moment.' : 'Deine Ziehung startet ab dem ersten Los.';
  for (const input of $('#ticket-form').elements) input.disabled = locked || busy;
  $('#next-round').disabled = busy;
  $('#import-button').disabled = busy;
  renderParticipants();
  renderHistory();
}

$('#ticket-form').addEventListener('submit', event => {
  event.preventDefault();
  act(() => {
    const name = $('#player-name').value.trim();
    const count = Number($('#ticket-count').value);
    commit(addTickets(state, name, count));
    toast(`${count} ${count === 1 ? 'Los' : 'Lose'} für ${name} im Topf.`);
    $('#player-name').value = '';
    $('#ticket-count').value = '1';
    $('#player-name').focus();
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
  $('#confirm-dialog').showModal();
}

$('#confirm-action').addEventListener('click', () => {
  const callback = confirmCallback;
  confirmCallback = null;
  $('#confirm-dialog').close();
  act(() => callback?.());
});

$('#next-round').addEventListener('click', () => act(() => {
  askConfirmation('Neue Runde starten?', state.tickets.length && !state.lastDraw ? 'Die aktuelle Runde wurde noch nicht gezogen. Alle aktuellen Lose werden entfernt. Exportiere bei Bedarf zuerst eine Sicherung. Bisherige Gewinner bleiben gespeichert.' : 'Der Lostopf wird geleert. Einstellungen und die letzten 100 Gewinner bleiben gespeichert.', 'Neue Runde starten', () => {
    commit(nextRound(state));
    toast(`Runde #${String(state.round).padStart(2, '0')} ist eröffnet.`);
    $('#lotterie').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
}));

function revealWinner(draw, celebrate = false) {
  clearInterval(animationTimer);
  clearTimeout(revealTimer);
  $('#winner-heading').textContent = draw.winner.name;
  $('#winner-eyebrow').textContent = 'DAS GLÜCK HAT ENTSCHIEDEN';
  $('#rolling-number').hidden = true;
  $('#winner-ticket').textContent = `Los #${ticketNumber(draw.winner.number)} · Runde #${String(draw.round).padStart(2, '0')} · ${draw.ticketCount} ${draw.ticketCount === 1 ? 'Los' : 'Lose'} im Topf`;
  $('#winner-prize').textContent = money(draw.jackpot, draw.currency);
  $('#winner-result').hidden = false;
  $('#winner-heading').setAttribute('aria-live', 'polite');
  busy = false;
  render();
  if (celebrate && !reducedMotion.matches) {
    const fragment = document.createDocumentFragment();
    const colors = ['#d6eea7', '#f1e6c5', '#94b97a', '#ffffff'];
    for (let i = 0; i < 35; i++) {
      const piece = element('span', 'confetti-piece');
      piece.style.left = `${(i * 37) % 100}%`;
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.animationDelay = `${(i % 7) * .12}s`;
      fragment.append(piece);
    }
    $('#confetti').replaceChildren(fragment);
  }
}

$('#draw-button').addEventListener('click', () => act(() => {
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
  $('#winner-heading').textContent = 'Das Glück entscheidet …';
  $('#winner-eyebrow').textContent = 'DER GROSSE MOMENT';
  $('#winner-result').hidden = true;
  $('#rolling-number').hidden = false;
  $('#winner-dialog').showModal();
  const draw = state.lastDraw;
  if (reducedMotion.matches) return revealWinner(draw);
  let frame = 0;
  const roll = () => {
    const current = state.tickets[(frame++ * 13) % state.tickets.length];
    $('#rolling-number').textContent = ticketNumber(current.number);
  };
  roll();
  animationTimer = setInterval(roll, 80);
  revealTimer = setTimeout(() => revealWinner(draw, true), 2300);
}));

for (const button of document.querySelectorAll('.close-dialog')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}
$('#winner-dialog').addEventListener('close', () => {
  clearInterval(animationTimer);
  clearTimeout(revealTimer);
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
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = `sercans-lotterie-runde-${state.round}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Deine Sicherung wird heruntergeladen.');
}));

$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5_000_000) return toast('Die Sicherung darf höchstens 5 MB groß sein.', true);
  try {
    const restored = normalizeState(JSON.parse(await file.text()));
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
    clearInterval(animationTimer);
    clearTimeout(revealTimer);
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
