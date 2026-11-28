// warstwa klimatu: pikselowy canvas pod wszystkimi ekranami (kurz, zar i oczy w ciemnosci)
// oczy pojawiaja sie tylko w pustych miejscach ekranu, nigdy na planszy, wiec niczego nie zdradzaja
const Atmos = (() => {
  const PX = 3;   // jeden piksel klimatu = 3 piksele ekranu (ostry pixel-art)
  const cv = document.getElementById('atmo');
  const ctx = cv.getContext('2d');

  // elementy, ktorych oczy nie moga zaslaniac
  const AVOID = ['#grid-container', '#hud', '#side-panel', '.title-border', '.node-panel',
                 '.tut-card', '.death-stats', '.death-title', '.win-title', '#overlay-msg', '.btn-main'];

  // kolory oczu (jasny, przygaszony) - te same akcenty co potwory
  const EYE_COLORS = [
    ['#b4ff7a', '#3f7a2c'],   // szlam
    ['#8af0ff', '#1f5a6e'],   // straznik
    ['#e0c8ff', '#5a3a92'],   // widmo
    ['#f0b44a', '#8c6420'],   // mimik
  ];
  const RED = ['#ff3b3b', '#7a1418'];

  let w = 0, h = 0;
  let depth = 0;          // 0 = pierwszy sektor, 1 = najglebiej
  let dust = [];
  let eyes = [];
  let nextEyeAt = 0;
  let lastFrame = 0;

  function resize() {
    w = Math.ceil(window.innerWidth / PX);
    h = Math.ceil(window.innerHeight / PX);
    cv.width = w;
    cv.height = h;
    dust = [];
    const count = Math.round((w * h) / 900);
    for (let i = 0; i < count; i++) dust.push(makeMote(true));
  }

  // drobinka kurzu albo zarzacy sie zar unoszacy sie powoli w gore
  function makeMote(anywhere) {
    const ember = Math.random() < 0.08 + depth * 0.12;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 2,
      vx: (Math.random() - 0.5) * 0.05,
      vy: -(0.02 + Math.random() * (ember ? 0.12 : 0.05)),
      a: ember ? 0.5 + Math.random() * 0.5 : 0.08 + Math.random() * 0.2,
      ember,
      phase: Math.random() * 6.28,
    };
  }

  // czy punkt ekranu (w pikselach) lezy na widocznym elemencie interfejsu
  function blocked(x, y) {
    for (const sel of AVOID) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (x > r.left - 24 && x < r.right + 24 && y > r.top - 24 && y < r.bottom + 24) return true;
      }
    }
    return false;
  }

  function spawnEye(now) {
    const maxEyes = 2 + Math.round(depth * 4);
    if (eyes.length >= maxEyes) return;
    const size = Math.random() < 0.25 ? 2 : 1;
    const gap = size === 2 ? 3 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);
    for (let tries = 0; tries < 12; tries++) {
      const x = 4 + Math.floor(Math.random() * (w - 12));
      const y = 4 + Math.floor(Math.random() * (h - 8));
      if (blocked(x * PX, y * PX) || blocked((x + gap + size) * PX, y * PX)) continue;
      const color = Math.random() < 0.15 + depth * 0.6 ? RED : EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)];
      const life = 2500 + Math.random() * 3500;
      eyes.push({ x, y, size, gap, color, born: now, life, blinkAt: now + 600 + Math.random() * (life - 1200) });
      return;
    }
  }

  function drawEyes(now) {
    eyes = eyes.filter(e => now - e.born < e.life);
    for (const e of eyes) {
      const t = now - e.born;
      // pojawianie sie i gasniecie
      let alpha = Math.min(1, t / 500, (e.life - t) / 700);
      if (alpha <= 0) continue;
      // mrugniecie: krotko zamkniete
      if (now > e.blinkAt && now < e.blinkAt + 140) continue;
      const [bright, dim] = e.color;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = dim;
      for (const ox of [0, e.gap + e.size]) {
        ctx.fillRect(e.x + ox - 1, e.y, e.size + 2, e.size);
        ctx.fillRect(e.x + ox, e.y - 1, e.size, e.size + 2);
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bright;
      ctx.fillRect(e.x, e.y, e.size, e.size);
      ctx.fillRect(e.x + e.gap + e.size, e.y, e.size, e.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawDust(dt, now) {
    for (let i = 0; i < dust.length; i++) {
      const m = dust[i];
      m.x += m.vx * dt * 0.06;
      m.y += m.vy * dt * 0.06;
      if (m.y < -2 || m.x < -2 || m.x > w + 2) { dust[i] = makeMote(false); continue; }
      if (m.ember) {
        const flicker = 0.6 + 0.4 * Math.sin(now / 180 + m.phase);
        ctx.globalAlpha = m.a * flicker;
        ctx.fillStyle = depth > 0.5 ? '#ff4a2a' : '#ff9a3d';
      } else {
        ctx.globalAlpha = m.a;
        ctx.fillStyle = '#6a6478';
      }
      ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = now - lastFrame;
    if (dt < 33) return;   // ok. 30 klatek na sekunde wystarczy
    lastFrame = now;
    ctx.clearRect(0, 0, w, h);
    drawDust(Math.min(dt, 100), now);
    if (now > nextEyeAt) {
      spawnEye(now);
      nextEyeAt = now + 1200 + Math.random() * (3200 - depth * 1800);
    }
    drawEyes(now);
  }

  // glebokosc 0..1 przyciemnia klimat: wiecej zaru i czerwonych oczu
  function setDepth(d) {
    depth = Math.max(0, Math.min(1, d));
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return { setDepth };
})();

window.Atmos = Atmos;
