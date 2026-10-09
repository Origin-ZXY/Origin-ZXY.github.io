'use strict';

// Time-scaled spring dynamics. No DOM writes occur in the particle loop.
function stepStar(star, pointer, elapsed, time, still = false) {
  const frame = Math.min(2.4, elapsed / (1000 / 60));
  const driftX = still ? 0 : Math.sin(time * .00032 + star.phase) * .3;
  const driftY = still ? 0 : Math.cos(time * .00027 + star.phase) * .3;
  star.vx += (star.homeX + driftX - star.x) * .009 * frame;
  star.vy += (star.homeY + driftY - star.y) * .009 * frame;
  if (pointer.active && !still) {
    let dx = star.x - pointer.x;
    let dy = star.y - pointer.y;
    let distance = Math.hypot(dx, dy);
    if (distance < pointer.radius) {
      if (distance < .5) {
        dx = Math.cos(star.phase);
        dy = Math.sin(star.phase);
        distance = 1;
      }
      const proximity = 1 - distance / pointer.radius;
      const force = proximity * proximity * 2.2 * frame;
      star.vx += (dx / distance - dy / distance * .08) * force + (pointer.velocityX || 0) * proximity * .012 * frame;
      star.vy += (dy / distance + dx / distance * .08) * force + (pointer.velocityY || 0) * proximity * .012 * frame;
    }
  }
  const damping = Math.pow(.87, frame);
  star.vx = Math.max(-4, Math.min(4, star.vx * damping));
  star.vy = Math.max(-4, Math.min(4, star.vy * damping));
  star.x += star.vx * frame;
  star.y += star.vy * frame;
}

class SpaceMusicBox {
  constructor(onState, Context) {
    this.Context = Context;
    this.onState = onState;
    this.context = null;
    this.enabled = false;
    this.audible = true;
    this.lastPhrase = -Infinity;
    this.phraseCount = 0;
    this.voices = new Set();
    this.scale = [73, 75, 77, 80, 82, 85, 87, 89];
    this.suspendTimer = null;
  }

  createGraph() {
    const ctx = this.context = new this.Context();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -22;
    limiter.knee.value = 20;
    limiter.ratio.value = 3;
    limiter.attack.value = .03;
    limiter.release.value = .6;
    this.master.connect(limiter).connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 3400;
    this.filter.Q.value = .45;
    this.filter.connect(this.master);

    // A soft stereo reverberation tail, synthesized locally without audio files.
    const reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 2.8), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < samples.length; i++) {
        smooth = smooth * .7 + (Math.random() * 2 - 1) * .3;
        samples[i] = smooth * Math.exp(-i / ctx.sampleRate * 2.5);
      }
    }
    reverb.buffer = impulse;
    this.wet = ctx.createGain();
    this.wet.gain.value = .22;
    this.filter.connect(reverb).connect(this.wet).connect(this.master);

    this.bed = ctx.createGain();
    this.bed.gain.value = .0018;
    this.bed.connect(this.filter);
    this.bedOscillators = [130.8128, 195.9977].map((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index ? 2 : -2;
      oscillator.connect(this.bed);
      oscillator.start();
      return oscillator;
    });
    ctx.onstatechange = () => this.notify();
  }

  notify() {
    this.onState({ enabled: this.enabled, audible: this.audible, context: this.context?.state || 'uninitialized', voices: this.voices.size, phrases: this.phraseCount });
  }

  async enable() {
    clearTimeout(this.suspendTimer);
    if (!this.context) this.createGraph();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio is not running');
    this.enabled = true;
    this.setAudible(this.audible);
  }

  fade(value, duration) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const parameter = this.master.gain;
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(now);
    else { parameter.cancelScheduledValues(now); parameter.setValueAtTime(parameter.value, now); }
    parameter.linearRampToValueAtTime(value, now + duration);
  }

  disable() {
    this.enabled = false;
    clearTimeout(this.suspendTimer);
    this.fade(0, .35);
    this.releaseVoices(.35);
    this.suspendTimer = setTimeout(() => {
      if (!this.enabled && this.context?.state === 'running') this.context.suspend().catch(() => {});
    }, 450);
    this.notify();
  }

  setAudible(value) {
    this.audible = value;
    if (this.enabled && this.context) {
      clearTimeout(this.suspendTimer);
      if (value && this.context.state === 'suspended') {
        this.context.resume().then(() => { if (this.enabled && this.audible) this.fade(.36, .9); }).catch(() => {});
      } else this.fade(value ? .36 : 0, value ? .9 : .45);
      if (!value) {
        this.releaseVoices(.45);
        this.suspendTimer = setTimeout(() => {
          if (!this.audible && this.context?.state === 'running') this.context.suspend().catch(() => {});
        }, 550);
      }
    }
    this.notify();
  }

  releaseVoices(duration) {
    if (!this.context) return;
    const stopAt = this.context.currentTime + duration;
    this.voices.forEach(voice => voice.oscillators.forEach(oscillator => {
      try { oscillator.stop(stopAt); } catch {}
    }));
  }

  trigger(horizontal, movement) {
    if (!this.enabled || !this.audible || this.context?.state !== 'running') return false;
    const now = this.context.currentTime;
    if (now - this.lastPhrase < 2.35 || this.voices.size > 6) return false;
    this.lastPhrase = now;
    const index = Math.min(this.scale.length - 3, Math.floor(Math.max(0, Math.min(.999, horizontal)) * (this.scale.length - 2)));
    const turn = [[2, 0, 1], [0, 2, 1], [2, 1, 0], [1, 0, 2]][this.phraseCount % 4];
    const velocity = .025 + Math.min(1, movement / 120) * .009;
    turn.forEach((offset, i) => this.note(this.scale[index + offset], now + [.04, .68, 1.54][i], velocity * (1 - i * .14)));
    this.phraseCount++;
    this.notify();
    return true;
  }

  note(midi, time, velocity) {
    const ctx = this.context;
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(velocity, time + .045);
    envelope.gain.exponentialRampToValueAtTime(.00005, time + 3.1);
    envelope.gain.linearRampToValueAtTime(0, time + 3.3);
    envelope.connect(this.filter);
    const voice = { oscillators: [], partials: [], envelope };
    this.voices.add(voice);
    // A mellow fundamental with quiet bell partials. No sharp clicks or beeps.
    [[1, 1], [2.01, .17], [3.97, .028], [6.22, .008]].forEach(([ratio, amplitude]) => {
      const oscillator = ctx.createOscillator();
      const partial = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency * ratio;
      partial.gain.value = amplitude;
      oscillator.connect(partial).connect(envelope);
      oscillator.start(time);
      oscillator.stop(time + 3.35);
      voice.oscillators.push(oscillator);
      voice.partials.push(partial);
    });
    voice.oscillators[0].onended = () => {
      voice.oscillators.forEach(oscillator => oscillator.disconnect());
      voice.partials.forEach(partial => partial.disconnect());
      envelope.disconnect();
      this.voices.delete(voice);
      this.notify();
    };
  }

  async dispose() {
    clearTimeout(this.suspendTimer);
    this.enabled = false;
    this.voices.clear();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { stepStar, SpaceMusicBox };

if (typeof document !== 'undefined') (async () => {
  const hero = document.querySelector('#hero');
  const stage = document.querySelector('.particle-stage');
  const titleCanvas = document.querySelector('#title-stars');
  const backgroundCanvas = document.querySelector('#space-background');
  if (!hero || !stage || !titleCanvas || !backgroundCanvas) return;
  const titleContext = titleCanvas.getContext('2d');
  const backgroundContext = backgroundCanvas.getContext('2d');
  const mask = document.createElement('canvas');
  const maskContext = mask.getContext('2d', { willReadFrequently: true });
  const restingCanvas = document.createElement('canvas');
  const restingContext = restingCanvas.getContext('2d');
  const spaceState = document.querySelector('#space-state');
  const fieldState = document.querySelector('#field-state');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const soundButton = document.querySelector('#sound-toggle');
  const soundMessage = document.querySelector('#sound-message');
  const Context = window.AudioContext || window.webkitAudioContext;
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let stars = [], starGroups = [], backgroundStars = [], flowers = [], blooms = [], dimensions = {}, ink = '', glow = '', frameID = 0, lastFrame = 0, lastMetrics = 0, lastBloom = -Infinity;
  let inView = true, disposed = false, resizeTimer, audioBusy = false;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: false, radius: 105, lastX: 0, lastY: 0, traveled: 0, velocityX: 0, velocityY: 0, bloomTravel: 0 };
  const camera = { x: 0, y: 0, targetX: 0, targetY: 0 };

  const music = Context ? new SpaceMusicBox(state => {
    const soundCode = state.enabled ? (state.audible ? 'ON' : 'QUIET') : 'OFF';
    const soundLabel = state.enabled ? '关闭声音' : '开启声音';
    soundButton.setAttribute('aria-pressed', String(state.enabled));
    soundButton.setAttribute('aria-label', `SOUND ${soundCode} ${soundLabel}`);
    document.querySelector('#sound-label').textContent = soundLabel;
    document.querySelector('#sound-state').textContent = soundCode;
    hero.dataset.audioContext = state.context;
    hero.dataset.audioVoices = String(state.voices);
    hero.dataset.audioPhrases = String(state.phrases);
  }, Context) : null;

  if (!Context) {
    soundButton.disabled = true;
    document.querySelector('#sound-label').textContent = '声音不可用';
    soundButton.setAttribute('aria-label', 'SOUND OFF 声音不可用');
  }
  soundButton.addEventListener('click', async () => {
    if (!music || audioBusy) return;
    audioBusy = true;
    soundButton.disabled = true;
    try {
      if (music.enabled) { music.disable(); soundMessage.textContent = '声音已关闭。'; }
      else { await music.enable(); soundMessage.textContent = '声音已开启。轻轻移动标题上的指针，可以触发旋律。'; }
    } catch {
      music.disable();
      soundMessage.textContent = '声音未能开启，请再试一次。';
    } finally { audioBusy = false; soundButton.disabled = false; }
  }, options);

  if (!titleContext || !backgroundContext || !maskContext || !restingContext) { spaceState.textContent = 'STATIC'; return; }

  const updatePalette = () => {
    const style = getComputedStyle(document.documentElement);
    ink = style.getPropertyValue('--star-rgb').trim();
    glow = style.getPropertyValue('--star-glow').trim();
    cacheRestingField();
    if (reduced.matches) render(performance.now(), 16);
  };
  const glyphWidth = (context, character) => context.measureText(character === ' ' ? 'M' : character).width * (character === ' ' ? .6 : 1);
  const trackedWidth = (context, text, tracking) => [...text].reduce((sum, character) => sum + glyphWidth(context, character), 0) + tracking * (text.length - 1);
  const drawTracked = (context, text, center, baseline, tracking) => {
    const characters = [...text];
    const total = trackedWidth(context, text, tracking);
    let x = center - total / 2;
    characters.forEach(character => { context.fillText(character, x, baseline); x += glyphWidth(context, character) + tracking; });
  };

  function build() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, width < 640 ? 1.5 : 2);
    dimensions = { width, height, heroWidth: hero.clientWidth, heroHeight: hero.clientHeight, dpr };
    titleCanvas.width = Math.round(width * dpr);
    titleCanvas.height = Math.round(height * dpr);
    restingCanvas.width = titleCanvas.width;
    restingCanvas.height = titleCanvas.height;
    backgroundCanvas.width = Math.round(dimensions.heroWidth * dpr);
    backgroundCanvas.height = Math.round(dimensions.heroHeight * dpr);
    titleContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    restingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    backgroundContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    mask.width = width;
    mask.height = height;
    maskContext.fillStyle = '#fff';
    const compact = width < 640;
    const name = document.querySelector('#hero-title [lang="en"]').textContent.trim().replace(/\s+/g, ' ');
    const words = name.split(' ');
    const lines = compact && words.length > 1 ? [words[0], words.slice(1).join(' ')] : [name];
    let fontSize = compact ? width * .22 : Math.min(174, width * .14);
    maskContext.font = `800 ${fontSize}px Jakarta, sans-serif`;
    const textWidth = Math.max(...lines.map(line => trackedWidth(maskContext, line, -fontSize * .035)));
    if (textWidth > width * .94) fontSize *= width * .94 / textWidth;
    maskContext.font = `800 ${fontSize}px Jakarta, sans-serif`;
    const lineGap = fontSize * 1.12;
    const firstBaseline = height / 2 + fontSize * .36 - (lines.length - 1) * lineGap / 2;
    lines.forEach((line, i) => drawTracked(maskContext, line, width / 2, firstBaseline + i * lineGap, -fontSize * .035));
    const pixels = maskContext.getImageData(0, 0, width, height).data;
    const spacing = compact ? 2.25 : 2.8;
    stars = [];
    starGroups = Array.from({ length: 5 }, () => []);
    for (let y = 0; y < height; y += spacing) {
      for (let x = 0; x < width; x += spacing) {
        if (pixels[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] < 100) continue;
        // Uneven positions, sizes and tonal groups make a dust texture, not a dot grid.
        if (Math.random() < .055) continue;
        const homeX = x + (Math.random() - .5) * spacing * .85;
        const homeY = y + (Math.random() - .5) * spacing * .85;
        const group = Math.random() < .085 ? 4 : Math.floor(Math.random() * 4);
        const star = { homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, radius: (compact ? .45 : .6) + Math.pow(Math.random(), .75) * .85, group, moving: false };
        stars.push(star);
        starGroups[group].push(star);
      }
    }
    backgroundStars = Array.from({ length: compact ? 28 : 48 }, () => ({ x: Math.random() * dimensions.heroWidth, y: Math.random() * dimensions.heroHeight, depth: .25 + Math.random() * .75, radius: .35 + Math.random() * .4, phase: Math.random() * Math.PI * 2 }));
    flowers = [[.17, .16, 9, 7], [.74, .12, 7, 6], [.88, .35, 12, 8], [.12, .57, 7, 5], [.79, .78, 10, 7], [.35, .82, 6, 4], [.52, .13, 5, 4]].map(([x, y, radius, petals], i) => ({ x: x * dimensions.heroWidth, y: y * dimensions.heroHeight, radius: compact ? radius * .8 : radius, petals, phase: i * 1.73 }));
    blooms = [];
    pointer.active = false;
    pointer.radius = compact ? 70 : 105;
    stage.dataset.ready = '';
    hero.dataset.particleCount = String(stars.length);
    spaceState.textContent = reduced.matches ? 'STILL' : 'READY';
    fieldState.textContent = reduced.matches ? 'STILL' : 'RESTING';
    updatePalette();
    render(performance.now(), 16);
    restart();
  }

  function paintStars(context, bounds = null, atHome = false) {
    starGroups.forEach((group, index) => {
      context.fillStyle = `rgb(${index === 4 ? glow : ink})`;
      context.globalAlpha = [ .5, .68, .84, 1, .95 ][index];
      context.beginPath();
      for (const star of group) {
        const x = atHome ? star.homeX : star.x;
        const y = atHome ? star.homeY : star.y;
        if (bounds && (x + star.radius < bounds.left || x - star.radius > bounds.right || y + star.radius < bounds.top || y - star.radius > bounds.bottom)) continue;
        context.moveTo(x + star.radius, y);
        context.arc(x, y, star.radius, 0, Math.PI * 2);
      }
      context.fill();
    });
    context.globalAlpha = 1;
  }

  function cacheRestingField() {
    if (!dimensions.width) return;
    restingContext.clearRect(0, 0, dimensions.width, dimensions.height);
    paintStars(restingContext, null, true);
  }

  function drawFlower(context, x, y, radius, petals, rotation, alpha, progress = 1) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.strokeStyle = `rgb(${glow})`;
    context.globalAlpha = alpha;
    context.lineWidth = .75;
    context.beginPath();
    const steps = 100;
    for (let i = 0; i <= steps * progress; i++) {
      const angle = i / steps * Math.PI * 2;
      const r = radius * (.63 + .37 * Math.cos(petals * angle));
      const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
      if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.stroke();
    if (progress > .95) {
      context.globalAlpha = alpha * .65;
      context.beginPath();
      context.arc(0, 0, radius * .16, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  function render(time, elapsed) {
    const { width, height, heroWidth, heroHeight } = dimensions;
    if (!width) return;
    const still = reduced.matches;
    const smoothing = 1 - Math.exp(-elapsed / 90);
    pointer.velocityX = (pointer.targetX - pointer.x) * smoothing;
    pointer.velocityY = (pointer.targetY - pointer.y) * smoothing;
    pointer.x += (pointer.targetX - pointer.x) * smoothing;
    pointer.y += (pointer.targetY - pointer.y) * smoothing;
    camera.x += (camera.targetX - camera.x) * .025;
    camera.y += (camera.targetY - camera.y) * .025;
    titleContext.clearRect(0, 0, width, height);
    const updateMetrics = time - lastMetrics > 250;
    let displacement = 0;
    const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    const radiusSquared = pointer.radius * pointer.radius;
    for (const star of stars) {
      const dx = star.homeX - pointer.x, dy = star.homeY - pointer.y;
      const nearby = pointer.active && dx * dx + dy * dy < radiusSquared;
      if (!still && (nearby || star.moving)) {
        star.moving = true;
        stepStar(star, pointer, elapsed, time);
        const distance = Math.hypot(star.x - star.homeX, star.y - star.homeY);
        if (!nearby && distance < .65 && Math.hypot(star.vx, star.vy) < .05) {
          star.x = star.homeX; star.y = star.homeY; star.vx = star.vy = 0; star.moving = false;
        }
        bounds.left = Math.min(bounds.left, star.homeX - 3, star.x - 3);
        bounds.right = Math.max(bounds.right, star.homeX + 3, star.x + 3);
        bounds.top = Math.min(bounds.top, star.homeY - 3, star.y - 3);
        bounds.bottom = Math.max(bounds.bottom, star.homeY + 3, star.y + 3);
        if (updateMetrics) displacement += distance;
      }
    }
    // Cache the resting field. Only redraw the area disturbed by the pointer.
    titleContext.globalAlpha = still ? 1 : .985 + Math.sin(time * .0003) * .015;
    titleContext.drawImage(restingCanvas, 0, 0, width, height);
    titleContext.globalAlpha = 1;
    if (bounds.left !== Infinity) {
      titleContext.save();
      titleContext.beginPath();
      titleContext.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      titleContext.clip();
      titleContext.clearRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
      paintStars(titleContext, bounds);
      titleContext.restore();
    }
    blooms = still ? [] : blooms.filter(bloom => time - bloom.born < 4200);
    for (const bloom of blooms) {
      const age = time - bloom.born;
      const unfold = 1 - Math.exp(-age / 520);
      const fade = Math.sin(Math.min(1, age / 4200) * Math.PI);
      drawFlower(titleContext, bloom.x, bloom.y - age * .003, bloom.radius * (.25 + unfold * .75), bloom.petals, bloom.rotation + age * .00008, fade * .42, Math.min(1, age / 900));
    }
    backgroundContext.clearRect(0, 0, heroWidth, heroHeight);
    backgroundContext.fillStyle = `rgb(${ink})`;
    for (const star of backgroundStars) {
      const drift = still ? 0 : time * .000009;
      const x = star.x + Math.sin(drift + star.phase) * 12 * star.depth + (still ? 0 : camera.x * star.depth);
      const y = star.y + Math.cos(drift * .8 + star.phase) * 10 * star.depth + (still ? 0 : camera.y * star.depth);
      const alpha = .06 + star.depth * .10 + (still ? 0 : Math.sin(time * .00018 + star.phase) * .025);
      backgroundContext.globalAlpha = alpha;
      backgroundContext.beginPath();
      backgroundContext.arc(x, y, star.radius * star.depth, 0, Math.PI * 2);
      backgroundContext.fill();
    }
    backgroundContext.globalAlpha = 1;
    for (const flower of flowers) {
      const phase = still ? flower.phase : time * .000045 + flower.phase;
      const x = flower.x + (still ? 0 : Math.sin(phase) * 13 + camera.x * .4);
      const y = flower.y + (still ? 0 : Math.cos(phase * .8) * 9 + camera.y * .4);
      drawFlower(backgroundContext, x, y, flower.radius, flower.petals, phase * .18, .1 + Math.sin(phase) * .035);
    }
    backgroundContext.strokeStyle = `rgba(${glow},.065)`;
    backgroundContext.lineWidth = .65;
    backgroundContext.setLineDash([1, 5]);
    backgroundContext.beginPath();
    backgroundContext.arc(heroWidth * .76, heroHeight * .86, Math.min(heroWidth * .22, 270), Math.PI * .9, Math.PI * 1.93);
    backgroundContext.stroke();
    backgroundContext.setLineDash([]);
    if (updateMetrics) {
      hero.dataset.particleDisplacement = (displacement / Math.max(1, stars.length)).toFixed(3);
      hero.dataset.bloomCount = String(blooms.length);
      fieldState.textContent = still ? 'STILL' : pointer.active ? 'DIFFUSING' : displacement / Math.max(1, stars.length) > 1.2 ? 'GATHERING' : 'RESTING';
      lastMetrics = time;
    }
  }

  function frame(time) {
    frameID = 0;
    if (disposed || document.hidden || !inView || reduced.matches) return;
    const elapsed = lastFrame ? Math.min(40, time - lastFrame) : 16;
    if (!lastFrame || elapsed >= (dimensions.width < 640 ? 30 : 15)) {
      render(time, elapsed);
      lastFrame = time;
    }
    frameID = requestAnimationFrame(frame);
  }
  function restart() {
    cancelAnimationFrame(frameID);
    frameID = 0;
    lastFrame = 0;
    if (!disposed && !document.hidden && inView && !reduced.matches) frameID = requestAnimationFrame(frame);
  }
  function leave() { pointer.active = false; pointer.traveled = pointer.bloomTravel = 0; camera.targetX = camera.targetY = 0; }
  function move(x, y) {
    if (!pointer.active) {
      pointer.x = pointer.targetX = pointer.lastX = x;
      pointer.y = pointer.targetY = pointer.lastY = y;
      pointer.traveled = 18;
    } else {
      const distance = Math.hypot(x - pointer.lastX, y - pointer.lastY);
      pointer.traveled += distance;
      pointer.bloomTravel += distance;
    }
    pointer.targetX = pointer.lastX = x;
    pointer.targetY = pointer.lastY = y;
    pointer.active = true;
    const now = performance.now();
    if (!reduced.matches && now - lastBloom > 600 && (pointer.bloomTravel > 30 || !blooms.length)) {
      blooms.push({ x, y, born: now, radius: 18 + Math.random() * 13, petals: 6 + Math.floor(Math.random() * 3), rotation: Math.random() * Math.PI });
      if (blooms.length > 6) blooms.shift();
      lastBloom = now;
      pointer.bloomTravel = 0;
    }
    if (pointer.traveled > 16 && music?.trigger(x / dimensions.width, pointer.traveled)) pointer.traveled = 0;
  }
  stage.addEventListener('pointermove', event => {
    const rectangle = stage.getBoundingClientRect();
    move(event.clientX - rectangle.left, event.clientY - rectangle.top);
  }, options);
  stage.addEventListener('pointerdown', event => {
    const rectangle = stage.getBoundingClientRect();
    move(event.clientX - rectangle.left, event.clientY - rectangle.top);
  }, options);
  ['pointerleave', 'pointercancel', 'blur'].forEach(event => stage.addEventListener(event, leave, options));
  stage.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') leave(); }, options);
  stage.addEventListener('keydown', event => {
    if (event.key === 'Escape') { leave(); return; }
    const directions = { ArrowLeft: [-28, 0], ArrowRight: [28, 0], ArrowUp: [0, -28], ArrowDown: [0, 28] };
    if (!directions[event.key]) return;
    event.preventDefault();
    const [dx, dy] = directions[event.key];
    move(Math.max(0, Math.min(dimensions.width, (pointer.active ? pointer.targetX : dimensions.width / 2) + dx)), Math.max(0, Math.min(dimensions.height, (pointer.active ? pointer.targetY : dimensions.height * .4) + dy)));
  }, options);
  hero.addEventListener('pointermove', event => {
    const rectangle = hero.getBoundingClientRect();
    camera.targetX = (event.clientX / rectangle.width - .5) * 10;
    camera.targetY = ((event.clientY - rectangle.top) / rectangle.height - .5) * 7;
  }, options);
  hero.addEventListener('pointerleave', () => { camera.targetX = camera.targetY = 0; }, options);
  const refreshActivity = () => {
    leave();
    music?.setAudible(inView && !document.hidden);
    restart();
  };
  document.addEventListener('visibilitychange', refreshActivity, options);
  reduced.addEventListener('change', () => { build(); refreshActivity(); }, options);
  const visibility = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    refreshActivity();
  }, { threshold: .05 });
  visibility.observe(hero);
  const resize = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 120);
  });
  resize.observe(stage);
  const palette = new MutationObserver(updatePalette);
  palette.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pagehide', event => {
    cancelAnimationFrame(frameID);
    music?.setAudible(false);
    if (!event.persisted) {
      disposed = true;
      clearTimeout(resizeTimer);
      resize.disconnect(); visibility.disconnect(); palette.disconnect();
      listeners.abort();
      music?.dispose().catch(() => {});
    }
  }, options);
  window.addEventListener('pageshow', event => { if (event.persisted) refreshActivity(); }, options);
  await document.fonts.ready;
  if (!disposed) build();
})();
