const preferenceKey = 'sercans-lotterie:effects:v1';
const palette = ['#d6eea7', '#f1e6c5', '#94b97a', '#fffdf1', '#b7ce84'];

/** Small, self-contained visual and opt-in audio effects. No external assets. */
export function createEffects({ motionToggle, soundToggle } = {}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let preferences = { motion: true, sound: false };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey));
    if (saved && typeof saved === 'object') {
      if (typeof saved.motion === 'boolean') preferences.motion = saved.motion;
      if (typeof saved.sound === 'boolean') preferences.sound = saved.sound;
    }
  } catch { /* Effects remain available when browser storage is blocked. */ }
  if (!AudioContextClass) preferences.sound = false;

  let context;
  let audioUnlocked = false;
  const sounds = new Set();
  const numberAnimations = new Map();
  const visualAnimations = new Set();
  const particles = new Set();
  const particleTimers = new Set();
  const motionEnabled = () => preferences.motion && !reducedMotion.matches;

  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); }
    catch { /* A setting still applies for this visit. */ }
  }

  function updateControls() {
    const motion = motionEnabled();
    document.documentElement.dataset.effects = motion ? 'on' : 'off';
    if (motionToggle) {
      motionToggle.setAttribute('aria-pressed', String(motion));
      motionToggle.classList.toggle('is-active', motion);
      motionToggle.disabled = reducedMotion.matches;
      motionToggle.title = reducedMotion.matches
        ? 'Dein Gerät hat reduzierte Bewegung aktiviert.'
        : 'Animationen ein- oder ausschalten';
      const label = motionToggle.querySelector('span');
      if (label) label.textContent = motion ? 'Effekte an' : 'Effekte aus';
    }
    if (soundToggle) {
      soundToggle.setAttribute('aria-pressed', String(preferences.sound));
      soundToggle.classList.toggle('is-active', preferences.sound);
      soundToggle.disabled = !AudioContextClass;
      soundToggle.title = AudioContextClass
        ? 'Dezente Ziehungstöne ein- oder ausschalten'
        : 'Sound wird in diesem Browser nicht unterstützt.';
      const label = soundToggle.querySelector('span');
      if (label) label.textContent = preferences.sound ? 'Sound an' : 'Sound aus';
    }
  }

  function notify() {
    updateControls();
    window.dispatchEvent(new CustomEvent('lottery-effects-change', {
      detail: { motion: motionEnabled(), sound: preferences.sound },
    }));
  }

  function stopSounds() {
    for (const note of sounds) {
      try { note.oscillator.stop(); } catch { /* Already ended. */ }
      note.oscillator.disconnect();
      note.gain.disconnect();
    }
    sounds.clear();
  }

  function reset() {
    for (const job of numberAnimations.values()) {
      cancelAnimationFrame(job.frame);
      job.finish();
    }
    numberAnimations.clear();
    for (const animation of visualAnimations) animation.cancel();
    visualAnimations.clear();
    for (const timer of particleTimers) clearTimeout(timer);
    particleTimers.clear();
    for (const particle of particles) particle.remove();
    particles.clear();
    stopSounds();
  }

  function unlockSound() {
    // Call synchronously from a real click, before awaiting the draw lock.
    if (!preferences.sound || !AudioContextClass) return Promise.resolve(false);
    audioUnlocked = true;
    try {
      context ??= new AudioContextClass();
      if (context.state === 'suspended') return context.resume().then(() => true).catch(() => false);
      return Promise.resolve(context.state === 'running');
    } catch { return Promise.resolve(false); }
  }

  function tone(frequency, offset, duration, volume = 0.035, type = 'sine') {
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + offset;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const note = { oscillator, gain };
    sounds.add(note);
    oscillator.onended = () => {
      sounds.delete(note);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.025);
  }

  function sound(kind) {
    if (!preferences.sound || !audioUnlocked || !context || context.state !== 'running') return;
    // Keep rapidly changing reels from building an unbounded audio queue.
    if (sounds.size > 12 && kind !== 'win') return;
    try {
      if (kind === 'tick') tone(780, 0, 0.045, 0.012, 'triangle');
      else if (kind === 'countdown') tone(440, 0, 0.16, 0.035);
      else if (kind === 'add') {
        tone(587.33, 0, 0.1, 0.025);
        tone(880, 0.08, 0.15, 0.025);
      } else if (kind === 'win') {
        stopSounds();
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          tone(frequency, index * 0.11, 0.6, 0.035);
        });
        tone(261.63, 0.33, 0.8, 0.025);
      }
    } catch { /* Audio must never interrupt a draw. */ }
  }

  function burst(container) {
    if (!container || !motionEnabled()) return;
    // Replace an earlier celebration rather than stacking particle systems.
    for (const particle of [...particles]) {
      if (particle.parentElement === container) {
        particle.remove();
        particles.delete(particle);
      }
    }
    const created = [];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 60; index++) {
      const particle = document.createElement('i');
      particle.className = 'show-confetti';
      particle.setAttribute('aria-hidden', 'true');
      particle.style.setProperty('--confetti-x', `${(index * 37.7) % 100}%`);
      particle.style.setProperty('--confetti-drift', `${((index * 71) % 260) - 130}px`);
      particle.style.setProperty('--confetti-spin', `${((index * 43) % 900) - 450}deg`);
      particle.style.setProperty('--confetti-delay', `${(index % 10) * 0.055}s`);
      particle.style.setProperty('--confetti-color', palette[index % palette.length]);
      particle.style.setProperty('--confetti-size', `${5 + index % 5}px`);
      if (index % 4 === 0) particle.classList.add('is-round');
      created.push(particle);
      particles.add(particle);
      fragment.append(particle);
    }
    container.append(fragment);
    const timer = setTimeout(() => {
      created.forEach(particle => { particle.remove(); particles.delete(particle); });
      particleTimers.delete(timer);
    }, 4500);
    particleTimers.add(timer);
  }

  function pulse(target) {
    if (!target || !motionEnabled() || typeof target.animate !== 'function') return;
    const animation = target.animate([
      { scale: '1', filter: 'brightness(1)' },
      { scale: '1.025', filter: 'brightness(1.08)', offset: 0.35 },
      { scale: '1', filter: 'brightness(1)' },
    ], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' });
    visualAnimations.add(animation);
    animation.finished.then(() => visualAnimations.delete(animation)).catch(() => visualAnimations.delete(animation));
  }

  function animateNumber(target, from, to, formatter = String) {
    if (!target) return;
    const previous = numberAnimations.get(target);
    if (previous) {
      cancelAnimationFrame(previous.frame);
      numberAnimations.delete(target);
    }
    const finish = () => { if (target.isConnected) target.textContent = formatter(to); };
    if (!motionEnabled() || from === to || !Number.isFinite(from) || !Number.isFinite(to)) return finish();
    const start = performance.now();
    const job = { frame: 0, finish };
    const frame = now => {
      if (!target.isConnected || !motionEnabled()) {
        finish();
        numberAnimations.delete(target);
        return;
      }
      const progress = Math.min(1, (now - start) / 650);
      const eased = 1 - (1 - progress) ** 3;
      target.textContent = formatter(Math.round(from + (to - from) * eased));
      if (progress < 1) job.frame = requestAnimationFrame(frame);
      else numberAnimations.delete(target);
    };
    numberAnimations.set(target, job);
    job.frame = requestAnimationFrame(frame);
  }

  motionToggle?.addEventListener('click', () => {
    preferences.motion = !preferences.motion;
    if (!motionEnabled()) reset();
    savePreferences();
    notify();
  });
  soundToggle?.addEventListener('click', () => {
    if (!AudioContextClass) return;
    preferences.sound = !preferences.sound;
    if (!preferences.sound) stopSounds();
    else unlockSound().then(() => sound('add'));
    savePreferences();
    notify();
  });
  reducedMotion.addEventListener('change', () => {
    if (!motionEnabled()) reset();
    notify();
  });
  window.addEventListener('pagehide', reset);
  updateControls();
  return { motionEnabled, unlockSound, sound, burst, pulse, animateNumber, reset };
}
