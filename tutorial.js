// =====================================================================
// SAMOUCZEK - krotki kreator "Jak grac" (6 krokow)
// Otwiera sie automatycznie przy pierwszej grze oraz z przyciskow "JAK GRAC" / "?".
// Ilustracje korzystaja z tych samych klas CSS co prawdziwa plansza.
// =====================================================================
const Tutorial = (() => {
  // ---------- male klocki do budowy ilustracji ----------
  const S = (name) => Sprites.html(name);   // pixel-artowy sprite wstawiany w tekst
  const covered = (inner = '', extra = '') =>
    `<div class="cell covered ${extra}">${inner}</div>`;
  const peek = (sprite, lvl) =>   // zakryte pole "prześwietlone" - widac wroga i jego poziom
    `<div class="cell covered echoed"><span class="echo-reveal" style="opacity:1">${S(sprite)}</span>` +
    `<span class="demo-lvl">${lvl}</span></div>`;
  const number = (n, extra = '') =>
    `<div class="cell revealed n${n} ${extra}"><span class="cell-num">${n}</span></div>`;
  const blank = () => `<div class="cell revealed"></div>`;
  const icon = (sprite, extra = '') =>
    `<div class="cell revealed ${extra}"><span class="spr spr-${sprite} cell-icon center"></span></div>`;
  const grid = (rows) =>
    `<div class="demo-grid" style="grid-template-columns:repeat(${rows[0].length},var(--cell-size))">` +
    rows.flat().join('') + `</div>`;
  const chip = (html, cls = '') => `<span class="demo-chip ${cls}">${html}</span>`;

  // ---------- tresc krokow ----------
  const steps = [
    {
      title: 'Cel: Klucz i Właz',
      demo: () => `<div class="demo-row">${icon('key', 'key-cell')}<span class="demo-arrow">→</span>${icon('hatch_open', 'hatch-cell')}</div>`,
      text: () => `
        <p>Każdy sektor to plansza z <b>zakrytych kafelków</b>. W środku kryją się potwory, skarby oraz dwa ważne przedmioty.</p>
        <p>Znajdź <b>${S('key')} Klucz</b>, a potem <b>${S('hatch_open')} Właz</b> i kliknij go, żeby przejść dalej. <b>Nie musisz</b> odkrywać całej planszy.</p>
        <p class="tut-tip">Pierwsze kliknięcie w sektorze jest zawsze bezpieczne.</p>`,
    },
    {
      title: 'Liczby = suma poziomów wrogów',
      demo: () => grid([
          [peek('slime', 1), covered(), covered()],
          [covered(), number(3), peek('guardian', 2)],
          [covered(), covered(), covered()],
        ]) + `<div class="demo-caption">${chip(S('slime') + ' 1')} + ${chip(S('guardian') + ' 2')} = <b class="n3-text">3</b></div>`,
      text: () => `
        <p>Cyfra na odkrytym polu to <b>suma poziomów</b> wszystkich wrogów, którzy kryją się na <b>8 sąsiednich polach</b> (także po skosie).</p>
        <p>Pole bez cyfry oznacza <b>0 wrogów</b> dookoła. Takie pola same odsłaniają sąsiadów.</p>
        <p class="tut-tip">Gdy pokonasz wroga, cyfry wokół niego zmniejszają się i krótko błyskają. Zawsze pokazują wrogów, którzy wciąż się ukrywają.</p>`,
    },
    {
      title: 'Walka',
      demo: () => `
        <div class="demo-fight">${chip(S('sword') + ' ATK 1', 'atk')} <span class="demo-vs">vs</span> ${chip(S('guardian') + ' poziom 2')} <span class="demo-arrow">→</span> ${chip('−1 ' + S('heart'), 'bad')}</div>
        <div class="demo-fight">${chip(S('sword') + ' ATK 2', 'atk')} <span class="demo-vs">vs</span> ${chip(S('guardian') + ' poziom 2')} <span class="demo-arrow">→</span> ${chip('0 obrażeń', 'good')}</div>`,
      text: () => `
        <p>Kliknięcie zakrytego pola z wrogiem to <b>walka</b>. Obrażenia = <b>poziom wroga − twój ATK</b> (minimum 0).</p>
        <p>Za każdego pokonanego wroga dostajesz <b>EXP</b>. Awans daje <b>+1 ATK, +1 ${S('heart')} i +1 ${S('mana')}</b>. Gdy ${S('heart')} spadnie do 0, podejście się kończy.</p>
        <p class="tut-tip">Znając cyfry, możesz kliknąć pole, w którym na pewno jest słaby wróg, i wygrać bez strat.</p>`,
    },
    {
      title: 'Księga Zaklęć (mana)',
      demo: () => `
        <div class="demo-spells">
          <div class="demo-spell"><span class="ds-ico">${S('flag')}</span><b>Znak Słabości</b><i>1 MP</i><em>PPM lub klawisz 1</em></div>
          <div class="demo-spell"><span class="ds-ico">${S('eye')}</span><b>Echokacja</b><i>2 MP</i><em>klawisz 2</em></div>
          <div class="demo-spell"><span class="ds-ico">${S('blast')}</span><b>Dezintegracja</b><i>4 MP</i><em>klawisz 3</em></div>
        </div>`,
      text: () => `
        <p><b>Znak Słabości</b> oznacza podejrzane pole i chroni je przed przypadkowym kliknięciem. Ponowny PPM zdejmuje znak i zwraca 1 MP.</p>
        <p><b>Echokacja</b> bezpiecznie pokazuje, co kryje pole. <b>Dezintegracja</b> niszczy potwora bez walki i bez strat HP.</p>
        <p class="tut-tip">Wybierz zaklęcie (klawisz lub przycisk), potem kliknij zakryte pole. <b>Esc</b> anuluje. Zaklęcia działają od pierwszego ruchu w sektorze.</p>`,
    },
    {
      title: 'Łupy i zasoby',
      demo: () => `
        <div class="demo-loot">
          <div>${icon('potion')}<span>+1 ${S('heart')}</span></div>
          <div>${icon('crystal')}<span>+1 MP</span></div>
          <div>${icon('shield')}<span>tarcza</span></div>
        </div>`,
      text: () => `
        <p>Przedmioty leżą pod <b>bezpiecznymi</b> polami. Gdy je odkryjesz, <b>kliknij je</b>, żeby podnieść.</p>
        <p><b>${S('shield')} Tarcza Kinetyczna</b> pochłania obrażenia z najbliższej walki.</p>
        <p class="tut-tip">Na polu z przedmiotem cyfra wrogów dookoła jest w lewym górnym rogu. Nie ginie pod ikoną.</p>`,
    },
    {
      title: 'Mimiki, runy i Węzeł',
      demo: () => `<div class="demo-row">${peek('mimic', 0)}<span class="demo-arrow">→</span>${chip('−1 ' + S('heart'), 'bad')}</div>`,
      text: () => `
        <p><b>${S('mimic')} Mimik</b> ma poziom 0, więc nie dodaje nic do cyfr i udaje puste pole. Kliknięty bez Echokacji zabiera 1 ${S('heart')}. Na każdym sektorze jest ich tylko kilka. Gdy nie masz pewności, użyj Echokacji.</p>
        <p>Za każdy sektor dostajesz <b>${S('rune')} Złote Runy</b>. Między sektorami wydasz je na <b>ulepszenia trwałe</b> (zostają po śmierci) albo na <b>zapasy</b>, które ratują bieżącą wyprawę.</p>
        <p>Po <b>sektorze 5</b> czeka <b>Bezpieczny Węzeł</b>: pełne zdrowie i mana, a w kampanii wracasz tam po śmierci.</p>`,
    },
  ];

  // ---------- logika kreatora ----------
  let idx = 0;
  let opened = false;
  let onClose = null;

  const el = (id) => document.getElementById(id);

  function render() {
    const s = steps[idx];
    const last = idx === steps.length - 1;
    el('tut-step').textContent = `KROK ${idx + 1} / ${steps.length}`;
    el('tut-title').textContent = s.title;
    el('tut-demo').innerHTML = s.demo();
    el('tut-text').innerHTML = s.text();
    el('tut-dots').innerHTML = steps
      .map((_, i) => `<span class="tut-dot${i === idx ? ' active' : ''}"></span>`)
      .join('');
    el('tut-prev').style.visibility = idx === 0 ? 'hidden' : 'visible';
    el('tut-skip').style.display = last ? 'none' : '';
    el('tut-next').textContent = last ? '▶ ZACZYNAMY!' : 'DALEJ →';
  }

  function open(callback) {
    idx = 0;
    opened = true;
    onClose = typeof callback === 'function' ? callback : null;
    el('tutorial').classList.add('open');
    render();
    el('tut-next').focus();
  }

  function close() {
    if (!opened) return;
    opened = false;
    el('tutorial').classList.remove('open');
    window.Save.data.tutorialSeen = true;   // po obejrzeniu lub pominieciu nie pokazujemy automatycznie
    window.Save.save();
    const cb = onClose;
    onClose = null;
    if (cb) cb();
  }

  function next() { if (idx < steps.length - 1) { idx++; render(); } else close(); }
  function prev() { if (idx > 0) { idx--; render(); } }

  el('tut-next').addEventListener('click', next);
  el('tut-prev').addEventListener('click', prev);
  el('tut-skip').addEventListener('click', close);
  el('tut-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (!opened) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') next();
  });

  return { open, close, next, prev, isOpen: () => opened, stepCount: steps.length };
})();

window.Tutorial = Tutorial;
