(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var $ = function (id) { return document.getElementById(id); };

  var TAU = Math.PI * 2;
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var randInt = function (a, b) { return Math.floor(rand(a, b + 1)); };
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var angTo = function (x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); };
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }

  var C = {
    cyan: [55, 247, 255],
    pink: [255, 80, 200],
    yellow: [255, 220, 60],
    green: [90, 255, 140],
    orange: [255, 150, 60],
    red: [255, 70, 90],
    purple: [170, 100, 255],
    blue: [90, 170, 255],
    white: [235, 244, 255]
  };
  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a === undefined ? 1 : a) + ')';
  }

  var DPR = 1, cssW = 1, cssH = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.floor(cssW * DPR);
    canvas.height = Math.floor(cssH * DPR);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  resize();

  var glowCache = {};
  var glowCount = 0;
  function shapePath(g, shape, r) {
    g.beginPath();
    if (shape === 'diamond') {
      g.moveTo(0, -r); g.lineTo(r * 0.7, 0); g.lineTo(0, r); g.lineTo(-r * 0.7, 0);
    } else if (shape === 'hex') {
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * TAU - Math.PI / 2;
        var px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
    } else if (shape === 'tri') {
      g.moveTo(r * 1.15, 0); g.lineTo(-r * 0.8, r * 0.8); g.lineTo(-r * 0.8, -r * 0.8);
    } else {
      g.arc(0, 0, r, 0, TAU);
    }
    g.closePath();
  }
  function q(x) { return Math.round(x * 2) / 2; }
  function baked(c, r, shape) {
    var key = (shape || 'circle') + c[0] + ',' + c[1] + ',' + c[2] + ',' + r;
    var hit = glowCache[key];
    if (hit) return hit;
    var pad = r * 2.0, half = r + pad;
    var dim = Math.ceil(half * 2 * 2);
    var cv = document.createElement('canvas');
    cv.width = cv.height = dim;
    var g = cv.getContext('2d');
    g.scale(2, 2);
    g.translate(half, half);
    var grad = g.createRadialGradient(0, 0, r * 0.15, 0, 0, half);
    grad.addColorStop(0, rgba(c, 0.55));
    grad.addColorStop(0.45, rgba(c, 0.16));
    grad.addColorStop(1, rgba(c, 0));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, half, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = rgba(c, 0.95);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = Math.max(1, r * 0.16);
    shapePath(g, shape, r);
    g.fill(); g.stroke();
    var spr = { cv: cv, half: half };
    if (glowCount > 900) { glowCache = {}; glowCount = 0; }
    glowCache[key] = spr;
    glowCount += 1;
    return spr;
  }
  function drawSpr(spr, x, y) {
    ctx.drawImage(spr.cv, x - spr.half, y - spr.half, spr.half * 2, spr.half * 2);
  }

  var actx = null, masterGain = null, musicGain = null, musicTimer = null, musicStep = 0;
  var muted = (function () { try { return localStorage.getItem('neonMuted') === '1'; } catch (e) { return false; } })();
  function audioInit() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      masterGain = actx.createGain(); masterGain.gain.value = muted ? 0 : 0.5; masterGain.connect(actx.destination);
      musicGain = actx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(masterGain);
      return true;
    } catch (e) { return false; }
  }
  function tone(f, dur, type, vol, slideTo, delay, dest) {
    if (!actx) return;
    var t0 = actx.currentTime + (delay || 0);
    var o = actx.createOscillator();
    var g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || masterGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq, delay, qv) {
    if (!actx) return;
    var t0 = actx.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(actx.sampleRate * dur));
    var buf = actx.createBuffer(1, len, actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = actx.createBufferSource(); src.buffer = buf;
    var bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq || 1200; bp.Q.value = qv === undefined ? 1 : qv;
    var g = actx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(masterGain);
    src.start(t0);
  }
  function sfx(name) {
    if (!actx || muted) return;
    switch (name) {
      case 'pew': tone(740, 0.06, 'square', 0.07, 190); noise(0.05, 0.04, 2400, 0, 2); break;
      case 'hit': tone(240, 0.05, 'triangle', 0.12, 110); break;
      case 'explode': noise(0.32, 0.4, 700, 0, 0.7); tone(150, 0.28, 'sawtooth', 0.2, 42); break;
      case 'gem': tone(1100, 0.08, 'sine', 0.12, 1750); break;
      case 'powerup': tone(420, 0.09, 'square', 0.14, 640); tone(640, 0.1, 'square', 0.14, 980, 0.09); tone(980, 0.16, 'square', 0.12, 1310, 0.18); break;
      case 'dash': noise(0.16, 0.22, 1300, 0, 1.4); break;
      case 'hurt': tone(200, 0.22, 'sawtooth', 0.28, 60); noise(0.18, 0.3, 450, 0, 0.6); break;
      case 'wave': tone(330, 0.13, 'square', 0.16, 440); tone(440, 0.16, 'square', 0.16, 660, 0.12); break;
      case 'over': tone(260, 0.4, 'sawtooth', 0.24, 50); tone(180, 0.5, 'sawtooth', 0.22, 30, 0.25); noise(0.6, 0.4, 500, 0.1, 0.5); break;
      case 'click': tone(920, 0.05, 'square', 0.1, 620); break;
      case 'shield': tone(300, 0.3, 'sine', 0.22, 620); break;
      case 'heal': tone(300, 0.12, 'sine', 0.18, 620); tone(620, 0.16, 'sine', 0.16, 990, 0.1); break;
    }
  }
  function startMusic() {
    if (!actx || musicTimer) return;
    musicStep = 0;
    var bass = [55, 55, 0, 0, 65.41, 0, 0, 73.42, 0, 55, 0, 0, 98, 0, 82.41, 0];
    var mel = [0, 0, 220, 0, 0, 0, 261.63, 0, 0, 0, 329.63, 0, 0, 0, 392, 0];
    musicTimer = setInterval(function () {
      var step = musicStep; musicStep = (musicStep + 1) % 16;
      if (step % 2 === 1) noise(0.04, 0.022, 7500, 0, 3);
      var b = bass[step];
      if (b) tone(b, 0.19, 'triangle', 0.1, undefined, 0, musicGain);
      var m = mel[step];
      if (m) tone(m, 0.16, 'sine', 0.05, undefined, 0, musicGain);
    }, 135);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('neonMuted', muted ? '1' : '0'); } catch (e) { }
    if (actx && masterGain) masterGain.gain.value = muted ? 0 : 0.5;
  }

  var keys = {};
  var keyJust = {};
  var mouse = { x: 0, y: 0, down: false };
  var padIndex = -1, prevButtons = null;
  var touchSticks = { left: { id: -1, bx: 0, by: 0, kx: 0, ky: 0, len: 0, ang: 0 }, right: { id: -1, bx: 0, by: 0, kx: 0, ky: 0, len: 0, ang: 0 } };
  var touchActive = 0, inputMode = 'desktop';
  var stickR = 64;

  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (!e.repeat) keyJust[e.code] = true;
    if (e.code === 'KeyM') toggleMute();
    if ((touchSticks.left.id === -1 && touchSticks.right.id === -1) || keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD']) inputMode = 'desktop';
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; keyJust = {}; mouse.down = false; });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (touchSticks.left.id === -1 && touchSticks.right.id === -1) inputMode = 'desktop';
  });
  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 0) {
      audioInit(); mouse.down = true;
      if (touchSticks.left.id === -1 && touchSticks.right.id === -1) inputMode = 'desktop';
    }
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) mouse.down = false; });

  function dashtapped(x, y) {
    var dx = x - cssW / 2, dy = y - (cssH - 56);
    return dx * dx + dy * dy < 60 * 60;
  }
  function setTouch(id, sx, sy) {
    if (sx < cssW * 0.5 && touchSticks.left.id === -1) {
      touchSticks.left.id = id; touchSticks.left.bx = sx; touchSticks.left.by = sy;
      touchSticks.left.kx = sx; touchSticks.left.ky = sy; touchSticks.left.len = 0; touchSticks.left.ang = 0;
    } else if (sx >= cssW * 0.5 && touchSticks.right.id === -1) {
      touchSticks.right.id = id; touchSticks.right.bx = sx; touchSticks.right.by = sy;
      touchSticks.right.kx = sx; touchSticks.right.ky = sy; touchSticks.right.len = 0; touchSticks.right.ang = 0;
    }
  }
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    audioInit();
    inputMode = 'touch';
    touchActive = 0.4;
    if (state === 'playing') {
      try { requestFullscreen(); } catch (err) { }
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (dashtapped(t.clientX, t.clientY)) { dashTouchPress = true; continue; }
        setTouch(t.identifier, t.clientX, t.clientY);
      }
      return;
    }
    for (var j = 0; j < e.changedTouches.length; j++) setTouch(e.changedTouches[j].identifier, e.changedTouches[j].clientX, e.changedTouches[j].clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    inputMode = 'touch';
    touchActive = 0.4;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var st = touchSticks.left.id === t.identifier ? touchSticks.left : (touchSticks.right.id === t.identifier ? touchSticks.right : null);
      if (!st) continue;
      var dx = t.clientX - st.bx, dy = t.clientY - st.by;
      var len = Math.min(hypot(dx, dy), stickR);
      var a = Math.atan2(dy, dx);
      st.len = len; st.ang = a;
      st.kx = st.bx + Math.cos(a) * len; st.ky = st.by + Math.sin(a) * len;
    }
  }, { passive: false });
  function clearTouch(id) {
    if (touchSticks.left.id === id) { touchSticks.left.id = -1; touchSticks.left.len = 0; }
    if (touchSticks.right.id === id) { touchSticks.right.id = -1; touchSticks.right.len = 0; }
  }
  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) clearTouch(e.changedTouches[i].identifier);
  }, { passive: false });
  canvas.addEventListener('touchcancel', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) clearTouch(e.changedTouches[i].identifier);
  }, { passive: false });

  window.addEventListener('gamepadconnected', function (e) { padIndex = e.gamepad.index; prevButtons = null; });
  window.addEventListener('gamepaddisconnected', function (e) { if (padIndex === e.gamepad.index) padIndex = -1; });
  window.gamepadPolyfill = true;
  function getPad() {
    if (padIndex === -1 || !navigator.getGamepads) return null;
    var pads;
    try { pads = navigator.getGamepads(); } catch (e) { pads = []; }
    return (pads && pads[padIndex]) || null;
  }
  function padAxis(pad, i) { return pad.axes && pad.axes[i] !== undefined ? pad.axes[i] : 0; }
  function padBtn(pad, i) { return pad.buttons && pad.buttons[i] ? pad.buttons[i].pressed : false; }
  function padEdge(pad, i) {
    if (!pad.buttons || !pad.buttons[i]) return false;
    var cur = pad.buttons[i].pressed;
    if (!prevButtons) { prevButtons = []; for (var k = 0; k < 16; k++) prevButtons[k] = false; }
    var prev = !!prevButtons[i];
    prevButtons[i] = cur;
    return cur && !prev;
  }

  function requestFullscreen() {
    var el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(function () { });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  var dashTouchPress = false;
  var stickAiming = false;
  var inP = { move: { x: 0, y: 0 }, aim: null, fire: false };
  var dirX = 0, dirY = -1;

  function readInput() {
    var pad = getPad();
    var padUsed = false;
    if (pad) {
      var dlx = padAxis(pad, 0), dly = padAxis(pad, 1), drx = padAxis(pad, 2), dry = padAxis(pad, 3);
      var ll = hypot(dlx, dly), rl = hypot(drx, dry);
      var btnHeld = false;
      for (var bi2 = 0; bi2 < (pad.buttons.length || 0); bi2++) {
        if (pad.buttons[bi2] && (pad.buttons[bi2].pressed || pad.buttons[bi2].value > 0.1)) { btnHeld = true; break; }
      }
      if (ll > 0.2 || rl > 0.2 || btnHeld) {
        padUsed = true;
        inputMode = 'pad';
      }
    }
    var touchLive = touchSticks.left.id !== -1 || touchSticks.right.id !== -1;
    if (touchLive) inputMode = 'touch';

    var usePad = !!pad && padUsed && inputMode === 'pad';
    var useTouch = touchLive;

    var move = { x: 0, y: 0 }, aim = null, fire = false;
    stickAiming = false;

    if (usePad) {
      stickAiming = true;
      var dead = 0.18;
      if (ll > dead) { move.x = dlx * Math.min(1, (ll - dead) / (1 - dead)); move.y = dly * Math.min(1, (ll - dead) / (1 - dead)); }
      if (rl > dead) {
        var ang = Math.atan2(dry, drx);
        aim = { x: Math.cos(ang), y: Math.sin(ang) };
        fire = true;
      }
      if (padBtn(pad, 6) || padBtn(pad, 7)) {
        if (!aim) aim = { x: dirX, y: dirY };
        fire = true;
      }
    } else if (useTouch) {
      touchActive = 0.3;
      var ls = touchSticks.left, rs = touchSticks.right;
      if (ls.len > 4) { move.x = Math.cos(ls.ang) * Math.min(1, ls.len / stickR); move.y = Math.sin(ls.ang) * Math.min(1, ls.len / stickR); }
      if (rs.len > 10) {
        stickAiming = true;
        var ra = rs.ang;
        aim = { x: Math.cos(ra), y: Math.sin(ra) };
        fire = true;
      }
    } else {
      var mx = 0, my = 0;
      if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) my += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
      if (mx || my) { var ml = hypot(mx, my); move.x = mx / ml; move.y = my / ml; }
      if (player) {
        var dx = mouse.x - player.x, dy = mouse.y - player.y;
        var dl2 = hypot(dx, dy) || 1;
        aim = { x: dx / dl2, y: dy / dl2 };
      }
      fire = mouse.down;
    }
    inP.move = move;
    inP.aim = aim;
    inP.fire = fire;
  }

  var state = 'menu';
  function setState(s) {
    state = s;
    $('menu').classList.toggle('hidden', s !== 'menu');
    $('paused').classList.toggle('hidden', s !== 'paused');
    $('over').classList.toggle('hidden', s !== 'over');
    $('hud').classList.toggle('hidden', s === 'menu' || s === 'over');
  }

  var player = null, enemies = [], bullets = [], gems = [], powerups = [], particles = [], floats = [], shocks = [];
  var score = 0, wave = 1, waveT = 0, combo = 0, comboT = 0, time = 0;
  var spawnT = 0, shakeA = 0, hurtF = 0, flashNum = 0, spawnEvery = 1.1;
  var best = 0, lastCombo = 0, hudTxt = '';
  var banT = 0;
  var scoreKeys = ['neonBest1', 'neonBest2', 'neonBest3'];

  function loadBest() {
    var arr = [];
    for (var i = 0; i < 3; i++) arr.push(parseInt(localStorage.getItem(scoreKeys[i]) || '0', 10) || 0);
    best = arr[0];
  }
  function saveBest(sv) {
    var arr = [];
    for (var i = 0; i < 3; i++) arr.push(parseInt(localStorage.getItem(scoreKeys[i]) || '0', 10) || 0);
    arr.push(sv);
    arr.sort(function (a, b) { return b - a; });
    arr = arr.slice(0, 3);
    for (var j = 0; j < 3; j++) localStorage.setItem(scoreKeys[j], arr[j]);
    best = arr[0];
  }
  loadBest();
  var menuBest = $('menuBest');
  if (menuBest) menuBest.textContent = best > 0 ? 'BEST  ' + best : '';

  function newGame() {
    player = {
      x: cssW / 2, y: cssH / 2, r: 13, hp: 4, maxHp: 4,
      speed: 285, fireCd: 0, baseCd: 0.14, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
      inv: 0, ang: -Math.PI / 2, recoil: 0,
      powers: { rapid: 0, triple: 0, pierce: 0, homing: 0 }, shield: false
    };
    enemies = []; bullets = []; gems = []; powerups = []; particles = []; floats = []; shocks = [];
    score = 0; combo = 0; comboT = 0; wave = 1; waveT = 15; time = 0; spawnT = 0.5;
    shakeA = 0; hurtF = 0; flashNum = 0; spawnEvery = 1.1; hudTxt = ''; lastCombo = 0;
    syncHud(true);
    bannerWave();
    sfx('wave');
  }

  function startGame() {
    audioInit();
    newGame();
    setState('playing');
    startMusic();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function endGame() {
    setState('over');
    stopMusic();
    sfx('over');
    for (var i = 0; i < 40; i++) burst(player.x, player.y, C.cyan, 4, 140, 1);
    shakeA = 18;
    saveBest(score);
    $('waveBanner').classList.add('hidden');
    $('finalScore').innerHTML = '<span class="big">' + score + '</span><br>FINAL SCORE';
    $('best').textContent = 'BEST  ' + best;
  }

  function bannerWave() {
    var el = $('waveBanner');
    el.textContent = 'WAVE ' + wave;
    el.classList.remove('hidden');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    flashNum = 0.4;
    clearTimeout(banT);
    banT = setTimeout(function () { el.classList.add('hidden'); }, 1200);
  }

  function enemySpawn() {
    var side = randInt(0, 3);
    var x = 0, y = 0, m = 36;
    if (side === 0) { x = rand(0, cssW); y = -m; }
    else if (side === 1) { x = cssW + m; y = rand(0, cssH); }
    else if (side === 2) { x = rand(0, cssW); y = cssH + m; }
    else { x = -m; y = rand(0, cssH); }
    var roll = Math.random();
    var type = 'chaser';
    if (time > 20 && roll < 0.22) type = 'speedy';
    else if (time > 12 && roll < 0.4) type = 'wavy';
    else if (time > 45 && roll < 0.5) type = 'tank';
    var big = time > 90 && Math.random() < 0.15 ? 1.5 : 1;
    var e;
    if (type === 'speedy') e = { type: 'speedy', x: x, y: y, r: 8 * big, hp: 1, maxHp: 1, speed: 315 * (1 + time * 0.001), color: C.yellow, score: 15, shape: 'circle', flash: 0, seed: Math.random() * TAU, vx: 0, vy: 0 };
    else if (type === 'wavy') e = { type: 'wavy', x: x, y: y, r: 12 * big, hp: 4, maxHp: 4, speed: 230, color: C.pink, score: 20, shape: 'diamond', flash: 0, seed: Math.random() * TAU, vx: 0, vy: 0 };
    else if (type === 'tank') e = { type: 'tank', x: x, y: y, r: 24 * big, hp: 24, maxHp: 24, speed: 95, color: C.red, score: 40, shape: 'hex', flash: 0, seed: Math.random() * TAU, vx: 0, vy: 0 };
    else e = { type: 'chaser', x: x, y: y, r: 13 * big, hp: 3, maxHp: 3, speed: 215 * (1 + time * 0.0012), color: C.green, score: 10, shape: 'tri', flash: 0, seed: Math.random() * TAU, vx: 0, vy: 0 };
    enemies.push(e);
  }

  function burst(x, y, color, n, speed, size) {
    for (var i = 0; i < n; i++) {
      if (particles.length > 420) break;
      var a = Math.random() * TAU, s = rand(speed * 0.3, speed);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.7), max: 0.7, size: rand(size * 0.6, size), color: color, drag: 0.92 });
    }
  }
  function shock(x, y, color, maxr) {
    shocks.push({ x: x, y: y, r: 4, maxr: maxr || 70, color: color, t: 0.4 });
  }
  function floatTxt(x, y, txt, color, big) {
    floats.push({ x: x, y: y, txt: txt, color: color, t: 0.9, max: 0.9, big: !!big });
  }

  function shoot() {
    var p = player;
    var ang = p.ang;
    var spread = p.powers.triple > 0 ? 0.24 : 0;
    var n = p.powers.triple > 0 ? 3 : 1;
    var ox = Math.cos(ang), oy = Math.sin(ang);
    for (var i = 0; i < n; i++) {
      var a = ang + (i === 1 ? 0 : (i === 0 ? -spread : spread));
      var bx = p.x + Math.cos(a) * (p.r + 6), by = p.y + Math.sin(a) * (p.r + 6);
      bullets.push({ x: bx, y: by, a: a, r: 4, speed: 560, life: 1.1, dmg: 1, pierce: p.powers.pierce > 0 ? 1 : 0, homing: p.powers.homing > 0 ? 0.32 : (stickAiming ? 0.07 : 0), color: C.cyan });
    }
    burst(p.x + ox * (p.r + 4), p.y + oy * (p.r + 4), C.cyan, 2, 90, 3);
    p.recoil = 0.03;
    sfx('pew');
  }

  function update(dt) {
    time += dt;
    shakeA = Math.max(0, shakeA - dt * 30);
    hurtF = Math.max(0, hurtF - dt * 2.2);
    flashNum = Math.max(0, flashNum - dt * 2.5);

    var p = player;
    var mvx = inP.move.x, mvy = inP.move.y;
    var dashing = p.dashT > 0;

    if (p.dashCd > 0) p.dashCd -= dt;
    if (dashRequest) {
      dashRequest = false;
      if (p.dashCd <= 0) {
        p.dashT = 0.17;
        p.dashCd = 1.35;
        p.inv = Math.max(p.inv, 0.22);
        var ax = inP.aim ? inP.aim.x : mvx;
        var ay = inP.aim ? inP.aim.y : mvy;
        if (!ax && !ay) { ax = dirX; ay = dirY; }
        var al = hypot(ax, ay) || 1;
        p.dashDx = ax / al; p.dashDy = ay / al;
        burst(p.x, p.y, C.cyan, 12, 170, 3);
        sfx('dash');
      }
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dashDx * p.speed * 3.6 * dt;
      p.y += p.dashDy * p.speed * 3.6 * dt;
      burst(p.x + rand(-4, 4), p.y + rand(-4, 4), C.cyan, 1, 12, 2.5);
    } else {
      p.x += mvx * p.speed * dt;
      p.y += mvy * p.speed * dt;
    }
    p.x = clamp(p.x, 18, cssW - 18);
    p.y = clamp(p.y, 18, cssH - 18);

    if (inP.aim) p.ang = Math.atan2(inP.aim.y, inP.aim.x);
    dirX = Math.cos(p.ang); dirY = Math.sin(p.ang);

    if (p.inv > 0) p.inv -= dt;
    if (p.recoil > 0) p.recoil -= dt;

    if (inP.fire && !dashing) {
      p.fireCd -= dt;
      if (p.fireCd <= 0) {
        shoot();
        p.fireCd = p.baseCd * (p.powers.rapid > 0 ? 0.55 : 1);
      }
    }

    for (var k in p.powers) { if (p.powers[k] > 0) p.powers[k] -= dt; }

    var i;
    for (i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      if (b.homing > 0) {
        var trg = null, tr2 = (b.homing > 0.2 ? 700 : 340);
        var bd = tr2 * tr2;
        for (var j = 0; j < enemies.length; j++) {
          var en = enemies[j];
          var ex = en.x - b.x, ey = en.y - b.y;
          var ed = ex * ex + ey * ey;
          if (ed < bd) { bd = ed; trg = en; }
        }
        if (trg) {
          var want = angTo(b.x, b.y, trg.x, trg.y);
          var diff = wrapAngle(want - b.a);
          b.a += clamp(diff, -b.homing, b.homing);
        }
      }
      b.x += Math.cos(b.a) * b.speed * dt;
      b.y += Math.sin(b.a) * b.speed * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > cssW + 30 || b.y < -30 || b.y > cssH + 30) bullets.splice(i, 1);
    }

    for (i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var aP = angTo(e.x, e.y, p.x, p.y);
      var tx = p.x, ty = p.y;
      if (e.type === 'wavy') {
        var perp = aP + Math.PI / 2;
        var osc = Math.sin(time * 4.2 + e.seed) * 1.6;
        tx += Math.cos(perp) * osc * 26;
        ty += Math.sin(perp) * osc * 26;
      }
      var ddx = tx - e.x, ddy = ty - e.y;
      var dl2 = hypot(ddx, ddy) || 1;
      var sp = e.speed + (e.type === 'speedy' ? Math.sin(time * 5 + e.seed) * 40 : 0);
      e.vx = ddx / dl2 * sp;
      e.vy = ddy / dl2 * sp;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.flash > 0) e.flash -= dt;

      var hitEnemy = false;
      for (var bi = bullets.length - 1; bi >= 0; bi--) {
        var bl = bullets[bi];
        var rr = bl.r + e.r;
        var bx = bl.x - e.x, by = bl.y - e.y;
        if (bx * bx + by * by < rr * rr) {
          e.hp -= bl.dmg;
          e.flash = 0.08;
          burst(bl.x, bl.y, C.white, 3, 110, 2.5);
          sfx('hit');
          if (e.hp <= 0) { killEnemy(i); hitEnemy = true; }
          if (bl.pierce > 0) bl.pierce -= 1; else bullets.splice(bi, 1);
          break;
        }
      }
      if (hitEnemy) continue;
      if (i >= enemies.length) continue;

      var pr = p.r + e.r;
      var pd = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
      if (pd < pr * pr && p.inv <= 0 && !dashing) {
        e.x += Math.cos(aP) * 14;
        e.y += Math.sin(aP) * 14;
        hurtPlayer();
        if (state !== 'playing') break;
      }
    }

    if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

    var gi;
    for (gi = gems.length - 1; gi >= 0; gi--) {
      var gm = gems[gi];
      var gx = p.x - gm.x, gy = p.y - gm.y;
      var gd = hypot(gx, gy);
      if (gd < 110 && gd > 0.01) {
        var pull = (1 - gd / 110) * 520;
        gm.x += gx / gd * pull * dt;
        gm.y += gy / gd * pull * dt;
      }
      if (gd < 18) {
        gems.splice(gi, 1);
        score += gm.val;
        burst(gm.x, gm.y, gm.color, 4, 90, 2);
        sfx('gem');
        continue;
      }
      gm.t -= dt;
      if (gm.t <= 0) gems.splice(gi, 1);
    }

    for (var pi = powerups.length - 1; pi >= 0; pi--) {
      var pu = powerups[pi];
      var px = p.x - pu.x, py = p.y - pu.y;
      var pl = hypot(px, py);
      if (pl < 90 && pl > 0.01) { pu.x += px / pl * 300 * dt; pu.y += py / pl * 300 * dt; }
      if (pl < 20) {
        powerups.splice(pi, 1);
        applyPower(pu.type);
      } else {
        pu.t -= dt;
        if (pu.t <= 0) powerups.splice(pi, 1);
      }
    }

    for (var g3 = particles.length - 1; g3 >= 0; g3--) {
      var pt = particles[g3];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= Math.pow(pt.drag, dt * 60);
      pt.vy *= Math.pow(pt.drag, dt * 60);
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(g3, 1);
    }
    for (var g4 = floats.length - 1; g4 >= 0; g4--) {
      var ft = floats[g4];
      ft.y -= 46 * dt;
      ft.t -= dt;
      if (ft.t <= 0) floats.splice(g4, 1);
    }
    for (var g5 = shocks.length - 1; g5 >= 0; g5--) {
      var shk = shocks[g5];
      shk.r += (shk.maxr - shk.r) * 10 * dt;
      shk.t -= dt;
      if (shk.t <= 0) shocks.splice(g5, 1);
    }

    waveT -= dt;
    if (waveT <= 0) {
      wave += 1;
      waveT = 15;
      bannerWave();
      sfx('wave');
    }
    spawnEvery = Math.max(0.32, 1.1 - time * 0.0035);
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = Math.max(0.1, spawnEvery * rand(0.6, 1));
      enemySpawn();
    }

    syncHud();
  }

  function killEnemy(i) {
    var e = enemies[i];
    enemies.splice(i, 1);
    burst(e.x, e.y, e.color, e.r > 16 ? 22 : 12, 200, e.r * 0.55);
    shock(e.x, e.y, e.color, e.r * 7);
    shakeA = Math.min(22, shakeA + e.r * 0.22);
    combo += 1;
    comboT = 3;
    var mult = 1 + Math.min(combo * 0.05, 2);
    var pts = Math.round(e.score * mult);
    score += pts;
    floatTxt(e.x, e.y - e.r, '+' + pts, e.color, combo > 20);
    if (e.type === 'tank') {
      for (var k = 0; k < 2; k++) {
        var a2 = Math.random() * TAU;
        enemies.push({ type: 'chaser', x: e.x + Math.cos(a2) * 8, y: e.y + Math.sin(a2) * 8, r: 9, hp: 2, maxHp: 2, speed: 235, color: C.green, score: 10, shape: 'tri', flash: 0.1, seed: Math.random() * TAU, vx: Math.cos(a2) * 120, vy: Math.sin(a2) * 120 });
      }
    }
    var nG = randInt(1, 3);
    for (var g = 0; g < nG; g++) {
      gems.push({ x: e.x + rand(-12, 12), y: e.y + rand(-12, 12), val: 10, color: C.purple, t: 9, tw: Math.random() * TAU });
    }
    if (Math.random() < 0.08) {
      var types = ['rapid', 'triple', 'pierce', 'homing', 'shield', 'health'];
      var weights = [22, 18, 16, 14, 15, 15];
      var acc = 0, r8 = Math.random() * 100;
      for (var w = 0; w < weights.length; w++) { acc += weights[w]; if (r8 < acc) { powerups.push({ x: e.x, y: e.y, type: types[w], t: 10 }); break; } }
    }
    sfx('explode');
  }

  var puMetaCache = {
    rapid: { c: C.orange, l: 'R' },
    triple: { c: C.purple, l: '3' },
    pierce: { c: C.blue, l: 'P' },
    homing: { c: C.green, l: 'H' },
    shield: { c: C.cyan, l: 'S' },
    health: { c: C.pink, l: '+' }
  };

  function applyPower(type) {
    var p = player;
    var m = puMetaCache[type];
    shock(p.x, p.y, m.c, 90);
    burst(p.x, p.y, m.c, 16, 220, 3);
    if (type === 'shield') { p.shield = true; sfx('shield'); }
    else if (type === 'health') { if (p.hp < p.maxHp) p.hp += 1; sfx('heal'); }
    else { p.powers[type] = 9; sfx('powerup'); }
    floatTxt(p.x, p.y - p.r - 10, type.toUpperCase(), m.c, true);
  }

  function hurtPlayer() {
    var p = player;
    if (p.shield) {
      p.shield = false;
      p.inv = 1.2;
      burst(p.x, p.y, C.cyan, 24, 260, 3.5);
      shock(p.x, p.y, C.cyan, 90);
      sfx('shield');
      return;
    }
    p.hp -= 1;
    p.inv = 1.2;
    shakeA = 20;
    hurtF = 1;
    burst(p.x, p.y, C.red, 18, 240, 4);
    shock(p.x, p.y, C.red, 80);
    sfx('hurt');
    syncHud(true);
    if (p.hp <= 0) endGame();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, cssW, cssH);

    var ox = 0, oy = 0;
    if (shakeA > 0) { ox = rand(-shakeA, shakeA) * 0.5; oy = rand(-shakeA, shakeA) * 0.5; }

    ctx.save();
    ctx.translate(ox, oy);
    drawGrid();

    if (state === 'playing' || state === 'paused') {
      for (var g = 0; g < gems.length; g++) {
        var gm = gems[g];
        var tw = Math.sin(gm.tw + time * 5) * 0.4 + 0.6;
        drawSpr(baked(gm.color, q(7 * tw)), gm.x, gm.y + Math.sin(time * 4 + gm.tw) * 3);
      }

      for (var g6 = 0; g6 < shocks.length; g6++) {
        var shk = shocks[g6];
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(shk.color, shk.t);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(shk.x, shk.y, shk.r, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      for (var g7 = 0; g7 < powerups.length; g7++) {
        var pu = powerups[g7];
        var meta = puMetaCache[pu.type];
        drawSpr(baked(meta.c, 13), pu.x, pu.y);
        ctx.fillStyle = '#051018';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(meta.l, pu.x, pu.y + 1);
      }

      for (var g8 = 0; g8 < bullets.length; g8++) {
        var b = bullets[g8];
        drawSpr(baked(b.color, q(b.r + 1.5)), b.x, b.y);
      }

      ctx.globalCompositeOperation = 'lighter';
      for (var g9 = 0; g9 < particles.length; g9++) {
        var pt = particles[g9];
        var al = Math.max(0, pt.life / pt.max);
        ctx.fillStyle = rgba(pt.color, al);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * al + 0.5, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      for (var gA = 0; gA < enemies.length; gA++) {
        var en = enemies[gA];
        drawSpr(baked(en.color, q(en.r * 1.15)), en.x, en.y);
        ctx.save();
        ctx.translate(en.x, en.y);
        ctx.rotate(Math.atan2(en.vy, en.vx));
        var col = en.flash > 0 ? C.white : en.color;
        shapePath(ctx, en.shape, en.r);
        ctx.fillStyle = rgba(col, 0.95);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = Math.max(1, en.r * 0.16);
        shapePath(ctx, en.shape, en.r);
        ctx.stroke();
        if (en.maxHp > 1 && en.hp < en.maxHp) {
          ctx.rotate(-Math.atan2(en.vy, en.vx));
          ctx.fillStyle = 'rgba(5,16,24,0.8)';
          ctx.fillRect(-en.r, -en.r - 10, en.r * 2, 4);
          ctx.fillStyle = rgba(col, 0.9);
          ctx.fillRect(-en.r, -en.r - 10, en.r * 2 * clamp(en.hp / en.maxHp, 0, 1), 4);
        }
        ctx.restore();
      }

      if (player) {
        var p = player;
        var blinkInv = p.inv > 0 && Math.floor(time * 18) % 2 === 0;
        if (!blinkInv) {
          ctx.save();
          ctx.translate(p.x + Math.cos(p.ang) * p.recoil * -120, p.y + Math.sin(p.ang) * p.recoil * -120);
          ctx.rotate(p.ang);
          drawSpr(baked(C.cyan, q(p.r * 1.5)), 0, 0);
          shapePath(ctx, 'hex', p.r);
          ctx.fillStyle = 'rgba(5,16,24,0.9)';
          ctx.fill();
          ctx.strokeStyle = '#eaffff';
          ctx.lineWidth = 2.5;
          shapePath(ctx, 'hex', p.r);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.r * 0.4, -p.r * 0.5);
          ctx.lineTo(p.r * 1.7, 0);
          ctx.lineTo(p.r * 0.4, p.r * 0.5);
          ctx.closePath();
          ctx.fillStyle = rgba(C.cyan, 0.95);
          ctx.fill();
          ctx.restore();
        }
        if (p.shield) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(55,247,255,0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 12, 0, TAU); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
        if (p.dashCd > 0) {
          ctx.strokeStyle = 'rgba(120,150,220,0.5)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 18, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / 1.35)); ctx.stroke();
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      for (var gB = 0; gB < floats.length; gB++) {
        var ft = floats[gB];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + (18 + (1 - ft.t / ft.max) * 8) + 'px monospace';
        ctx.fillStyle = rgba(ft.color, Math.min(1, ft.t / ft.max));
        ctx.fillText(ft.txt, ft.x, ft.y);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();

    if (flashNum > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flashNum * 0.18).toFixed(3) + ')';
      ctx.fillRect(0, 0, cssW, cssH);
    }
    if (hurtF > 0) {
      var vg = ctx.createRadialGradient(cssW / 2, cssH / 2, Math.min(cssW, cssH) * 0.3, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.75);
      vg.addColorStop(0, 'rgba(255,0,40,0)');
      vg.addColorStop(1, 'rgba(255,0,40,' + (0.35 * hurtF).toFixed(3) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    if (state === 'playing' || state === 'paused') drawTouches();
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(70,90,140,0.10)';
    ctx.lineWidth = 1;
    var cell = cssW > 700 ? 48 : 36;
    var off = (time * 22) % cell;
    ctx.beginPath();
    for (var x = -off; x < cssW + cell; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, cssH); }
    for (var y = -off; y < cssH + cell; y += cell) { ctx.moveTo(0, y); ctx.lineTo(cssW, y); }
    ctx.stroke();
    var rg = ctx.createRadialGradient(cssW / 2, cssH / 2, 40, cssW / 2, cssH / 2, Math.max(cssW, cssH) * 0.6);
    rg.addColorStop(0, 'rgba(55,247,255,0.05)');
    rg.addColorStop(1, 'rgba(55,247,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  function drawTouches() {
    var showing = isTouch;
    if (!showing) return;
    var anyStick = touchSticks.left.id !== -1 || touchSticks.right.id !== -1;
    ctx.globalCompositeOperation = 'lighter';
    if (touchSticks.left.id !== -1) {
      var ls = touchSticks.left;
      ctx.strokeStyle = 'rgba(55,247,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ls.bx, ls.by, stickR, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(55,247,255,0.45)';
      ctx.beginPath(); ctx.arc(ls.kx, ls.ky, 20, 0, TAU); ctx.fill();
    }
    if (touchSticks.right.id !== -1) {
      var rs = touchSticks.right;
      ctx.strokeStyle = 'rgba(255,80,200,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rs.bx, rs.by, stickR, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,80,200,0.45)';
      ctx.beginPath(); ctx.arc(rs.kx, rs.ky, 20, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = anyStick ? 'rgba(55,247,255,0.55)' : 'rgba(55,247,255,0.3)';
    ctx.beginPath(); ctx.arc(cssW / 2, cssH - 56, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = '#051018';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DASH', cssW / 2, cssH - 56);
    ctx.globalCompositeOperation = 'source-over';
  }

  function syncHud(force) {
    var p = player;
    if (p) {
      var s = '';
      for (var i = 0; i < p.maxHp; i++) s += i < p.hp ? '1' : '0';
      if (force || s !== hudTxt) {
        hudTxt = s;
        var hearts = '';
        for (var h = 0; h < p.maxHp; h++) hearts += '<span class="' + (s[h] === '1' ? '' : 'lost') + '"></span>';
        $('hearts').innerHTML = hearts;
      }
    }
    $('score').textContent = score;
    $('wave').textContent = 'WAVE ' + wave;
    var cEl = $('combo');
    if (combo >= 5) {
      var mult = 1 + Math.min(combo * 0.05, 2);
      cEl.textContent = 'COMBO ' + combo + '  x' + mult.toFixed(1);
      if (force || lastCombo !== combo) {
        lastCombo = combo;
        cEl.classList.remove('pulse');
        void cEl.offsetWidth;
        cEl.classList.add('pulse');
      }
    } else {
      cEl.textContent = '';
      lastCombo = 0;
    }
    var powersStr = '';
    if (p) {
      for (var pk in p.powers) {
        if (p.powers[pk] > 0) {
          var meta = puMetaCache[pk];
          powersStr += '<span style="background:' + rgba(meta.c, 0.9) + '">' + meta.l + '</span>';
        }
      }
      if (p.shield) powersStr += '<span style="background:' + rgba(C.cyan, 0.9) + '">S</span>';
    }
    var pw = $('powers');
    if (pw.innerHTML !== powersStr) pw.innerHTML = powersStr;
  }

  var dashRequest = false;
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  function toggle() {
    if (state === 'playing') { sfx('click'); setState('paused'); }
    else if (state === 'paused') { sfx('click'); setState('playing'); }
  }
  function keyHit(code) {
    if (keyJust[code]) { keyJust[code] = false; return true; }
    return false;
  }

  function tick(t) {
    requestAnimationFrame(tick);
    var dt = clamp((t - lastT) / 1000, 0, 1 / 30);
    lastT = t;
    if (document.hidden && state === 'playing') setState('paused');

    readInput();

    if (dashTouchPress && state === 'playing') { dashRequest = true; dashTouchPress = false; }

    var pad = getPad();
    if (pad) {
      if (padEdge(pad, 9) || padEdge(pad, 8)) toggle();
      if (padEdge(pad, 0) || padEdge(pad, 4) || padEdge(pad, 5)) {
        if (state === 'playing') dashRequest = true;
        else startGame();
      }
    }

    if (keyHit('KeyP') || keyHit('Escape')) toggle();
    if (keyHit('KeyM')) toggleMute();
    if (state === 'menu') {
      if (keyHit('Enter') || keyHit('Space')) startGame();
    } else if (state === 'playing') {
      if (keyHit('Space') || keyHit('ShiftLeft') || keyHit('ShiftRight')) dashRequest = true;
    } else if (state === 'over') {
      if (keyHit('Enter') || keyHit('KeyR') || keyHit('Space')) startGame();
    }

    if (state === 'playing') update(dt);
    render();
  }
  var lastT = 0;

  $('startBtn').addEventListener('click', startGame);
  $('retryBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', function () { sfx('click'); setState('playing'); });
  window.addEventListener('load', function () {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });

  var hints = $('hints');
  var keyh = $('keyhints');
  if (isTouch) {
    hints.innerHTML =
      '<div class="hint"><b>LEFT</b> thumb &mdash; move</div>' +
      '<div class="hint"><b>RIGHT</b> thumb &mdash; aim + shoot</div>' +
      '<div class="hint"><b>DASH</b> button &mdash; dodge through enemies</div>';
    keyh.textContent = 'Tip: add to your home screen for a fullscreen icon.';
  } else {
    hints.innerHTML =
      '<div class="hint"><b>WASD / ARROWS</b> move</div>' +
      '<div class="hint"><b>MOUSE</b> aim &middot; hold LMB to shoot</div>' +
      '<div class="hint"><b>SPACE / SHIFT</b> dash</div>' +
      '<div class="hint"><b>P</b> pause &middot; <b>M</b> mute</div>';
    keyh.innerHTML = '<kbd>WASD</kbd> move &nbsp; <kbd>MOUSE</kbd> aim/shoot &nbsp; <kbd>SPACE</kbd> dash &nbsp; <kbd>P</kbd> pause &nbsp; <kbd>M</kbd> mute &nbsp; <kbd>GAMEPAD</kbd> supported';
  }
  $('overhints').innerHTML = isTouch ? '<span>tap PLAY AGAIN to retry</span>' : '<kbd>R</kbd> or <kbd>ENTER</kbd> to retry';

  requestAnimationFrame(function (t0) { lastT = t0; requestAnimationFrame(tick); });
})();