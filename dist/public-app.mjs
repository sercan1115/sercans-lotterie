import { API_BASE } from './service-config.mjs';
import { createEffects } from './effects.mjs';
import { announcement } from './round-tools.mjs';
const $ = selector => document.querySelector(selector);
const effects = createEffects({ motionToggle: $('#motion-toggle'), soundToggle: $('#sound-toggle') });
const numbers = new Intl.NumberFormat('de-DE');
const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Berlin' });
const shortDate = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
const receiptKey = 'sercans-lotterie:receipts:v2';
const requestKey = 'sercans-lotterie:pending:v2';
let snapshot, currentReceipt, shownWinner, latestWinner;
let serverBaseline = 0, performanceBaseline = 0, lastSuccess = 0;
let loading = false, redeeming = false, pollTimer, toastTimer, showTimer;
let priorJackpot, zeroRequested = false;
let pendingRequests = {};
const copyStates = new WeakMap();
try { pendingRequests = JSON.parse(sessionStorage.getItem(requestKey) || '{}'); } catch { /* Network retries still work in this tab. */ }
if (!pendingRequests || typeof pendingRequests !== 'object' || Array.isArray(pendingRequests)) pendingRequests = {};

const money = (amount, currency) => `${numbers.format(amount)} ${currency}`;
const pad = value => String(value).padStart(2, '0');
const ticket = value => `#${String(value).padStart(3, '0')}`;
const serverNow = () => serverBaseline + performance.now() - performanceBaseline;
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function toast(text) { clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').hidden = false; toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000); }
function error(message) { $('#page-error').textContent = message; $('#page-error').hidden = !message; }

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal, credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error' });
    let result;
    try { result = await response.json(); } catch { throw new Error('Der Lotteriedienst hat keine gültige Antwort gesendet.'); }
    if (!response.ok) throw new Error(result.error || 'Die Anfrage konnte nicht verarbeitet werden.');
    return result;
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') throw new Error('Die Verbindung zum Lotteriedienst ist unterbrochen. Versuche es gleich erneut.');
    throw error;
  } finally { clearTimeout(timeout); }
}

function accept(next) {
  if (!next || !Number.isFinite(Date.parse(next.serverTime)) || !Array.isArray(next.history)) throw new Error('Die Rundendaten konnten nicht gelesen werden.');
  if (snapshot && Date.parse(next.serverTime) < Date.parse(snapshot.serverTime)) return;
  const previous = snapshot?.round;
  snapshot = next;
  serverBaseline = Date.parse(next.serverTime);
  performanceBaseline = performance.now();
  lastSuccess = performance.now();
  if (previous?.id !== next.round?.id) zeroRequested = false;
  $('#connection-status').textContent = 'Gemeinsam live';
  $('#sync-state').textContent = `Mit dem Server synchronisiert · ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(next.serverTime))} Uhr`;
  error('');
  render();
  if (previous && next.round && previous.id === next.round.id && previous.status === 'open' && next.round.winner && !$('#winner-dialog').open) playWinner(next.round.winner);
}

function render() {
  const round = snapshot?.round;
  $('#public-empty').hidden = !!round;
  $('#hero-round').textContent = round?.title || 'Die nächste Runde wird vorbereitet';
  $('#announcement-date').textContent = round ? `${date.format(new Date(round.announceAt))} Uhr · Deutschland` : 'Sercan legt den Termin im Veranstalterbereich fest.';
  $('#round-status').textContent = !round ? 'NOCH KEINE RUNDE' : round.status === 'announced' ? 'GEWINNER BEKANNT' : round.status === 'empty' ? 'RUNDE BEENDET' : 'TEILNAHME OFFEN';
  if (round) {
    if (priorJackpot !== round.jackpot) { effects.animateNumber($('#jackpot-number'), priorJackpot ?? round.jackpot, round.jackpot, value => numbers.format(value)); priorJackpot = round.jackpot; }
    $('#jackpot-currency').textContent = round.currency;
    $('#ticket-total').textContent = numbers.format(round.ticketCount);
    $('#participant-total').textContent = numbers.format(round.participantCount);
    $('#ticket-price').textContent = money(round.ticketPrice, round.currency);
  } else {
    for (const id of ['#jackpot-number', '#ticket-total', '#participant-total', '#ticket-price']) $(id).textContent = '—';
    $('#jackpot-currency').textContent = 'RP $';
  }
  const winner = round?.winner || snapshot.history[0];
  $('#winner-section').hidden = !winner;
  $('#winner-waiting').hidden = !!winner;
  if (winner) {
    $('#latest-winner-name').textContent = winner.winner.name;
    $('#latest-winner-prize').textContent = money(winner.jackpot, winner.currency);
    $('#latest-winner-ticket').textContent = `Runde #${pad(winner.round)} · Los ${ticket(winner.winner.number)} · ${shortDate.format(new Date(winner.drawnAt))}`;
    latestWinner = winner;
  }
  const history = document.createDocumentFragment();
  for (const draw of snapshot.history.slice(0, 20)) {
    const row = el('article', 'history-row');
    const player = el('div', 'history-player');
    player.append(el('strong', '', draw.winner.name), el('span', '', `Runde #${pad(draw.round)} · Los ${ticket(draw.winner.number)} · ${shortDate.format(new Date(draw.drawnAt))}`));
    const amount = el('div', 'history-amount', money(draw.jackpot, draw.currency));
    amount.append(el('small', '', draw.roundTitle));
    const view = el('button', 'button button-outline history-view', 'Ansehen');
    view.type = 'button'; view.setAttribute('aria-label', `Ergebnis der Runde ${draw.round} ansehen`);
    view.addEventListener('click', () => { effects.unlockSound(); playWinner(draw); });
    row.append(player, amount, view); history.append(row);
  }
  $('#history-list').replaceChildren(history);
  renderCountdown();
}

function renderCountdown() {
  const round = snapshot?.round;
  const stale = !lastSuccess || performance.now() - lastSuccess > 45_000;
  const remaining = round ? Math.max(0, Math.ceil((Date.parse(round.announceAt) - serverNow()) / 1000)) : null;
  const values = remaining === null ? ['—', '—', '—', '—'] : [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60].map(pad);
  ['#count-days', '#count-hours', '#count-minutes', '#count-seconds'].forEach((id, index) => { $(id).textContent = values[index]; });
  $('#redeem-button').disabled = redeeming || stale || !round || round.status !== 'open' || !remaining;
  $('#redeem-button span').textContent = redeeming ? 'Code wird geprüft …' : 'Code einlösen & teilnehmen';
  $('#countdown-note').textContent = !round ? 'Der Countdown startet, sobald der Termin feststeht.' : round.status === 'announced' ? 'Das Ergebnis ist da. Entdecke euren Gewinner weiter unten.' : round.status === 'empty' ? 'Diese Runde ist ohne eingelöste Lose beendet.' : !remaining ? 'Teilnahme geschlossen. Das Ergebnis wird vom Server geladen …' : 'Bis dahin kannst du deinen Code einlösen. Danach ist die Runde geschlossen.';
  if (stale && snapshot) $('#connection-status').textContent = 'Verbindung wird geprüft';
  if (round?.status === 'open' && !remaining && !zeroRequested && !loading) { zeroRequested = true; fetchPublic(); }
}

async function fetchPublic() {
  if (loading) return;
  loading = true;
  clearTimeout(pollTimer);
  try { accept(await api('/api/public')); }
  catch (e) { $('#connection-status').textContent = 'Verbindung unterbrochen'; error(e.message); }
  finally {
    loading = false;
    const awaitingWinner = snapshot?.round?.status === 'open' && Date.parse(snapshot.round.announceAt) <= serverNow();
    pollTimer = setTimeout(fetchPublic, document.hidden ? 30_000 : awaitingWinner ? 4000 : 15_000);
    renderCountdown();
  }
}

function showReceipt(receipt) {
  if (!receipt || typeof receipt.name !== 'string' || !Array.isArray(receipt.numbers) || !receipt.numbers.length || receipt.numbers.length > 100) return;
  currentReceipt = receipt;
  $('#receipt').hidden = false;
  $('#receipt-name').textContent = receipt.name;
  $('#receipt-round').textContent = `Runde #${pad(receipt.round)}`;
  $('#receipt-numbers').textContent = receipt.numbers.map(ticket).join(' · ');
  $('#receipt-details').textContent = `${receipt.count} ${receipt.count === 1 ? 'Los ist' : 'Lose sind'} für dich im Lostopf. Bestätigt am ${date.format(new Date(receipt.joinedAt))} Uhr.`;
}
try {
  const receipts = JSON.parse(localStorage.getItem(receiptKey) || '[]');
  if (Array.isArray(receipts) && receipts[0]) showReceipt(receipts[0]);
} catch { /* The server remains the source of truth. */ }

async function requestIdFor(code, name) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${code.trim().toUpperCase()}\0${name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')}`));
  const key = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (typeof pendingRequests[key] !== 'string') pendingRequests[key] = crypto.randomUUID();
  pendingRequests = Object.fromEntries(Object.entries(pendingRequests).slice(-30));
  try { sessionStorage.setItem(requestKey, JSON.stringify(pendingRequests)); } catch { /* Keep retry identity in memory. */ }
  return pendingRequests[key];
}

$('#redeem-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (redeeming || $('#redeem-button').disabled) return;
  redeeming = true; effects.unlockSound(); renderCountdown();
  $('#redeem-error').hidden = true;
  try {
    const code = $('#redeem-code').value.trim();
    const name = $('#redeem-name').value.trim();
    const requestId = await requestIdFor(code, name);
    const result = await api('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, requestId }) });
    accept(result.snapshot); showReceipt(result.receipt);
    try {
      const existing = JSON.parse(localStorage.getItem(receiptKey) || '[]');
      const receipts = Array.isArray(existing) ? existing.filter(r => r.id !== result.receipt.id) : [];
      localStorage.setItem(receiptKey, JSON.stringify([result.receipt, ...receipts].slice(0, 20)));
    } catch { toast('Teilnahme bestätigt. Kopiere deinen Beleg, da dein Browser ihn nicht speichern kann.'); }
    $('#redeem-code').value = '';
    effects.pulse($('#receipt')); effects.sound('add');
    $('#receipt').scrollIntoView({ behavior: effects.motionEnabled() ? 'smooth' : 'instant', block: 'center' });
  } catch (e) {
    $('#redeem-error').textContent = e.message; $('#redeem-error').hidden = false;
  } finally { redeeming = false; renderCountdown(); }
});

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = copyStates.get(button) || { nodes: [...button.childNodes].map(node => node.cloneNode(true)) };
    clearTimeout(original.timer);
    button.textContent = 'Kopiert!';
    original.timer = setTimeout(() => {
      button.replaceChildren(...original.nodes.map(node => node.cloneNode(true)));
      copyStates.delete(button);
    }, 2500);
    copyStates.set(button, original);
  } catch { toast('Kopieren ist hier nicht verfügbar. Markiere den Text und kopiere ihn manuell.'); }
}
$('#receipt-copy').addEventListener('click', () => {
  if (currentReceipt) copyText(`Sercan´s Lotterie · Teilnahmebestätigung\n${currentReceipt.name}\nRunde #${pad(currentReceipt.round)} · ${currentReceipt.count} Lose\n${currentReceipt.numbers.map(ticket).join(', ')}\nBeleg: ${currentReceipt.id}`, $('#receipt-copy'));
});

function revealWinner(draw, celebrate = false) {
  clearTimeout(showTimer); shownWinner = draw;
  $('#winner-dialog').dataset.stage = 'winner';
  $('#show-round').textContent = `RUNDE ${pad(draw.round)}`;
  $('#winner-heading').textContent = draw.winner.name;
  $('#winner-eyebrow').textContent = 'DAS ERGEBNIS STEHT FEST';
  $('#draw-stage').hidden = true; $('#winner-result').hidden = false;
  $('#winner-ticket').textContent = `Los ${ticket(draw.winner.number)} · ${numbers.format(draw.ticketCount)} Lose im Topf · Runde #${pad(draw.round)}`;
  effects.animateNumber($('#winner-prize-number'), celebrate ? 0 : draw.jackpot, draw.jackpot, value => numbers.format(value));
  $('#winner-prize-currency').textContent = draw.currency;
  if (celebrate) { effects.burst($('#confetti')); effects.sound('win'); }
}
function playWinner(draw) {
  effects.reset(); clearTimeout(showTimer); shownWinner = draw;
  const dialog = $('#winner-dialog');
  if (!dialog.open) dialog.showModal();
  if (!effects.motionEnabled()) return revealWinner(draw);
  dialog.dataset.stage = 'countdown';
  $('#show-round').textContent = `RUNDE ${pad(draw.round)}`;
  $('#winner-heading').textContent = 'Euer Ergebnis ist da.';
  $('#winner-eyebrow').textContent = 'EIN LOS HAT GESCHICHTE GESCHRIEBEN';
  $('#winner-result').hidden = true; $('#draw-stage').hidden = false; $('#draw-countdown').hidden = false; $('#draw-reel').hidden = true;
  let count = 3;
  const step = () => {
    if (!dialog.open) return;
    $('#draw-countdown').textContent = String(count); effects.sound('countdown');
    if (count-- > 1) showTimer = setTimeout(step, 650);
    else showTimer = setTimeout(() => revealWinner(draw, true), 650);
  };
  step();
}
$('#watch-winner').addEventListener('click', () => { effects.unlockSound(); if (latestWinner) playWinner(latestWinner); });
$('#copy-winner').addEventListener('click', () => { if (shownWinner) copyText(announcement(shownWinner), $('#copy-winner')); });
$('#celebrate-again').addEventListener('click', () => { effects.unlockSound(); effects.burst($('#confetti')); effects.sound('win'); });
for (const button of document.querySelectorAll('.close-dialog')) button.addEventListener('click', () => button.closest('dialog').close());
$('#winner-dialog').addEventListener('close', () => { clearTimeout(showTimer); effects.reset(); });
addEventListener('lottery-effects-change', event => { if (!event.detail.motion && $('#winner-dialog').open && shownWinner) revealWinner(shownWinner); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchPublic(); });
addEventListener('online', fetchPublic);
addEventListener('pagehide', () => { clearTimeout(pollTimer); clearTimeout(showTimer); effects.reset(); });
setInterval(renderCountdown, 1000);
fetchPublic();
