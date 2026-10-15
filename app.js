(() => {
  const $ = (sel) => document.querySelector(sel);

  const DEFAULT_GREETING = '저희 두 사람의 술장에 축하주 한 병씩 채워 주세요!\n함께 건배할 날을 기다릴게요. 🥂';
  const SWATCHES = ['#3fa66b', '#8a4b1f', '#6b1430', '#24452f', '#c47a1c', '#efeadc', '#e86a92', '#4a7bd1', '#f2c14e', '#7d5ba6'];
  const SETUP_FIELDS = ['groom', 'bride', 'date', 'time', 'venue', 'address', 'groomAccount', 'brideAccount', 'greeting', 'favorite', 'bgm'];

  let S = Store.state; // 마지막으로 받은 데이터
  let editing = false; // 신랑·신부가 청첩장 정보를 고치는 중
  let creating = false; // Supabase 첫 화면에서 새 청첩장을 만드는 중

  // ───────── 사운드 (8비트 효과음) ─────────
  let audio = null;
  function tone(freq, dur = 0.05, type = 'square', vol = 0.04, delay = 0) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) { /* 소리가 안 나도 동작에는 지장 없음 */ }
  }
  const sfx = {
    blip: () => tone(660 + Math.random() * 120, 0.03),
    pop: () => { tone(900, 0.04); tone(500, 0.08, 'square', 0.04, 0.04); },
    clink: () => { tone(1568, 0.12, 'triangle', 0.06); tone(2093, 0.18, 'triangle', 0.05, 0.08); },
    drop: () => { tone(330, 0.05); tone(440, 0.05, 'square', 0.04, 0.06); tone(660, 0.1, 'square', 0.04, 0.12); },
  };

  // ───────── 공통 도우미 ─────────
  // detail: 서버가 알려 준 오류 내용. 원인을 찾을 수 있게 함께 보여 준다.
  function toast(text, detail) {
    const el = $('#toast');
    el.textContent = detail ? `${text}\n(${detail})` : text;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, detail ? 8000 : 2200);
  }
  const detailOf = (e) => (e && e.detail) || '';

  function weddingDate(inv) {
    const [y, m, d] = inv.date.split('-').map(Number);
    const [hh, mm] = (inv.time || '12:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }

  function formatWhen(inv) {
    const dt = weddingDate(inv);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const h = dt.getHours();
    const ampm = h < 12 ? '오전' : '오후';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const min = dt.getMinutes() ? ` ${dt.getMinutes()}분` : '';
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일 ${days[dt.getDay()]}요일 ${ampm} ${h12}시${min}`;
  }

  function dday(inv) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = weddingDate(inv); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / 86400000);
    if (diff === 0) return 'D-DAY 🎉';
    return diff > 0 ? `D-${diff}` : `D+${-diff}`;
  }

  function capsuleOpenDate(inv) {
    const d = weddingDate(inv);
    d.setFullYear(d.getFullYear() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function copyText(text) {
    const done = () => toast('복사했어요!');
    try {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } catch (e) {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('복사가 안 돼요. 길게 눌러 직접 복사해 주세요.'); }
    ta.remove();
  }

  const visibleEntries = () => S.entries.filter((e) => !e.hidden);

  // 찬장 첫 칸에는 신랑·신부의 술이 놓여 있다
  function coupleBottle(inv) {
    return {
      id: 'couple',
      drink: inv.favorite || 'wine',
      color: null,
      ribbon: true,
      nickname: `${inv.groom} ♥ ${inv.bride}`,
      side: 'couple',
      message: inv.greeting || DEFAULT_GREETING,
    };
  }

  // ───────── 술 찬장 그리기 ─────────
  const CAB = { W: 116, TOP: 16, ROW: 30, BASE: 10, COLS: 5, SLOT: 20, X0: 8 };
  const LIGHT_COLORS = ['#ff7aa8', '#f2c14e', '#7fd1ff', '#9be36d'];
  const canvas = $('#cabinet');
  const ctx = canvas.getContext('2d');
  let bottles = [];
  const dropAnim = {};

  function cabinetRows() {
    return Math.max(4, Math.ceil((bottles.length + 1) / CAB.COLS));
  }

  function slotPos(i) {
    const r = Math.floor(i / CAB.COLS), c = i % CAB.COLS;
    return { x: CAB.X0 + c * CAB.SLOT + 5, baseY: CAB.TOP + (r + 1) * CAB.ROW - 3 };
  }

  function resizeCabinet() {
    const rows = cabinetRows();
    const H = CAB.TOP + rows * CAB.ROW + CAB.BASE;
    if (canvas.width !== CAB.W || canvas.height !== H) { canvas.width = CAB.W; canvas.height = H; }
    const avail = canvas.parentElement.clientWidth || CAB.W * 2;
    const scale = Math.max(1, Math.floor(avail / CAB.W));
    canvas.style.width = CAB.W * scale + 'px';
    canvas.style.height = H * scale + 'px';
    drawCabinet(performance.now());
  }

  function drawCabinet(now) {
    const W = canvas.width, H = canvas.height, rows = cabinetRows();
    ctx.clearRect(0, 0, W, H);

    // 몸체와 뒷벽
    ctx.fillStyle = '#3b2416'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#24150c'; ctx.fillRect(6, CAB.TOP, W - 12, rows * CAB.ROW);
    ctx.fillStyle = '#2c1a10';
    for (let x = 6; x < W - 6; x += 12) ctx.fillRect(x, CAB.TOP, 1, rows * CAB.ROW);

    // 위 장식과 꼬마전구
    ctx.fillStyle = '#6b4226'; ctx.fillRect(0, 0, W, CAB.TOP - 2);
    ctx.fillStyle = '#9a6436'; ctx.fillRect(0, 0, W, 2);
    ctx.fillStyle = '#2b1d14'; ctx.fillRect(0, CAB.TOP - 2, W, 2);
    for (let i = 0, x = 6; x < W - 14; x += 10, i++) {
      const sag = Math.round(Math.sin((x / W) * Math.PI * 4) * 1.5);
      const on = Math.floor(now / 500 + i) % 3 !== 0;
      ctx.fillStyle = '#2b1d14'; ctx.fillRect(x, 5 + sag, 10, 1);
      ctx.fillStyle = on ? LIGHT_COLORS[i % LIGHT_COLORS.length] : '#5a4a3a';
      ctx.fillRect(x + 4, 6 + sag, 2, 3);
    }

    // 선반
    for (let r = 0; r < rows; r++) {
      const y = CAB.TOP + (r + 1) * CAB.ROW - 3;
      ctx.fillStyle = '#9a6436'; ctx.fillRect(6, y, W - 12, 1);
      ctx.fillStyle = '#6b4226'; ctx.fillRect(6, y + 1, W - 12, 2);
    }

    // 다음 빈칸: 반투명한 병 실루엣으로 참여를 유도
    if (S.canWrite) {
      const next = slotPos(bottles.length);
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(now / 300);
      drawBottle(ctx, 'soju', { x: next.x, y: next.baseY, color: '#f6e9c9' });
      ctx.globalAlpha = 1;
    }

    // 술병
    bottles.forEach((b, i) => {
      const p = slotPos(i);
      let y = p.baseY;
      const start = dropAnim[b.id];
      if (start) {
        const t = Math.min(1, (now - start) / 700);
        const fall = 1 - Math.pow(1 - t, 3);
        const bounce = t > 0.75 ? Math.sin((t - 0.75) * 4 * Math.PI) * 2 : 0;
        y = Math.round(p.baseY - (1 - fall) * (p.baseY + 10) - bounce);
        if (t >= 1) delete dropAnim[b.id];
      }
      drawBottle(ctx, b.drink, { x: p.x, y, color: b.color, ribbon: b.ribbon, sealed: b.capsule });
      if (b.id === 'couple' && Math.floor(now / 400) % 2) {
        // 신랑·신부 술에는 반짝이 표시
        ctx.fillStyle = '#fff7c2'; ctx.fillRect(p.x + 9, y - bottleHeight(b.drink) - 1, 1, 1);
      }
    });

    // 옆 기둥과 받침
    ctx.fillStyle = '#6b4226'; ctx.fillRect(0, CAB.TOP, 6, H); ctx.fillRect(W - 6, CAB.TOP, 6, H);
    ctx.fillStyle = '#9a6436'; ctx.fillRect(1, CAB.TOP, 1, H - CAB.TOP); ctx.fillRect(W - 5, CAB.TOP, 1, H - CAB.TOP);
    ctx.fillStyle = '#6b4226'; ctx.fillRect(0, H - CAB.BASE, W, CAB.BASE);
    ctx.fillStyle = '#9a6436'; ctx.fillRect(0, H - CAB.BASE, W, 1);
    ctx.fillStyle = '#2b1d14'; ctx.fillRect(4, H - 3, 8, 3); ctx.fillRect(W - 12, H - 3, 8, 3);
  }

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastFrame = 0;
  function loop(now) {
    // 꼬마전구 깜빡임은 느려도 되므로, 떨어지는 애니메이션이 없을 땐 초당 10번만 다시 그린다
    if (!$('#invite').hidden && (Object.keys(dropAnim).length || (!reduceMotion && now - lastFrame > 100))) {
      drawCabinet(now);
      lastFrame = now;
    }
    requestAnimationFrame(loop);
  }

  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
    const c = Math.floor((x - CAB.X0) / CAB.SLOT);
    const r = Math.floor((y - CAB.TOP) / CAB.ROW);
    if (c < 0 || c >= CAB.COLS || r < 0) return;
    const i = r * CAB.COLS + c;
    if (i < bottles.length) openBottle(bottles[i]);
    else if (i === bottles.length && S.canWrite) openAdd();
  });

  // ───────── 화면 고르기 ─────────
  function show(id) {
    ['#loading', '#home', '#closed', '#setup', '#invite'].forEach((s) => { $(s).hidden = s !== id; });
    // 청첩장 화면을 떠나면 배경음악을 끈다 (만들기 화면의 미리 듣기는 그대로 둔다)
    if (id !== '#invite' && !(id === '#setup' && previewing)) { Chiptune.stop(); previewing = false; renderPreviewButton(); }
    renderBgmButton();
  }

  function showClosed(text, title = '🍶 아직 술장 문이 닫혀 있어요') {
    $('#closed-title').textContent = title;
    $('#closed-text').textContent = text;
    show('#closed');
  }

  function render(state) {
    S = state;
    if (S.mode === 'loading') return show('#loading');
    if (S.mode === 'nodb') return showClosed('claude.ai에 로그인해야 술장을 볼 수 있어요. 로그인한 뒤 다시 열어 주세요.');
    if (S.mode === 'sb-notfound') return showClosed('청첩장이 지워졌거나 링크가 잘못됐어요. 받은 링크를 다시 확인해 주세요.', '🍶 이 술장은 문을 닫았어요');
    if (S.mode === 'sb-error') return showClosed('서버에 연결하지 못했어요. 잠시 뒤 새로고침해 주세요.');
    if (S.mode === 'sb-home') {
      if (creating && S.home.email) { if ($('#setup').hidden) openSetup(); return; }
      creating = false;
      renderHome();
      return show('#home');
    }
    if (editing || !S.invitation) {
      if (S.isAdmin) { if ($('#setup').hidden) openSetup(); return; }
      return showClosed('신랑·신부가 청첩장을 준비하고 있어요. 조금 뒤에 다시 들러 주세요.');
    }
    show('#invite');
    renderInvite();
  }

  function renderInvite() {
    const inv = S.invitation;
    $('#demo-banner').hidden = S.mode !== 'demo';
    // 신랑·신부가 배경음악을 바꾸면 듣고 있던 하객의 음악도 바꾼다
    if (Chiptune.playing && Chiptune.playing !== currentBgm()) { Chiptune.stop(); if (currentBgm()) Chiptune.play(currentBgm()); }
    renderBgmButton();
    $('#hero-names').textContent = `${inv.groom} ♥ ${inv.bride}`;
    $('#hero-date').textContent = formatWhen(inv);
    $('#hero-dday').textContent = dday(inv);
    $('#info-when').textContent = formatWhen(inv);
    $('#info-venue').textContent = [inv.venue, inv.address].filter(Boolean).join('\n');
    $('#cheers-count').textContent = S.cheersTotal;
    $('#admin-btn').hidden = !S.isAdmin;
    $('#add-btn').hidden = !S.canWrite;
    $('#cheers-btn').hidden = !S.canWrite;
    $('#readonly-note').hidden = S.canWrite;
    const phase = phaseOf(inv);
    $('#add-btn').textContent = Store.myEntry() ? '🍾 내 술 다시 꾸미기' : phase === 'after' ? '🍾 늦은 축하 올리기' : '🍾 술 한 병 올리기';
    $('#sign-small').textContent = phase === 'day' ? '오늘 결혼해요!' : phase === 'after' ? '와 주셔서 고마워요' : 'WEDDING BAR';
    $('#sign-small').classList.toggle('ko', phase !== 'before');
    if (PHASE_PREVIEW) $('#hero-dday').textContent = phase === 'day' ? 'D-DAY 🎉' : phase === 'after' ? 'D+1' : dday(inv);
    const note = $('#hero-note');
    note.hidden = phase === 'before';
    note.textContent = phase === 'day'
      ? '오늘 두 사람이 결혼해요. 축하주 한 병 올려 주세요!'
      : '함께 축하해 주셔서 고마워요. 늦은 축하도 언제든 환영이에요.';
    // 예식이 끝나면 지도와 계좌 안내는 접어 둔다 (처음 그릴 때만 정하고, 하객이 펼친 건 그대로 둔다)
    if (lastPhase !== phase) { $('#info-fold').open = phase !== 'after'; lastPhase = phase; }
    setPetals(phase === 'day');
    $('#share-panel').hidden = !(S.mode === 'sb' && S.isAdmin);
    $('#share-url').textContent = Store.shareUrl();

    const maps = $('#map-links');
    maps.replaceChildren();
    const q = encodeURIComponent(inv.address || inv.venue);
    [['네이버 지도', `https://map.naver.com/p/search/${q}`], ['카카오맵', `https://map.kakao.com/link/search/${q}`]].forEach(([label, href]) => {
      const a = document.createElement('a');
      a.className = 'btn'; a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = label;
      maps.appendChild(a);
    });

    const acc = $('#accounts');
    acc.replaceChildren();
    [['신랑측', inv.groomAccount], ['신부측', inv.brideAccount]].forEach(([who, text]) => {
      if (!text) return;
      const row = document.createElement('div');
      row.className = 'account';
      const span = document.createElement('span');
      span.textContent = `${who} · ${text}`;
      const btn = document.createElement('button');
      btn.className = 'btn'; btn.textContent = '복사';
      btn.addEventListener('click', () => copyText(text));
      row.append(span, btn);
      acc.appendChild(row);
    });
    if (!acc.children.length) acc.textContent = '마음만으로 충분해요 💛';

    // 다른 하객이 새로 올린 술도 떨어지는 애니메이션으로 보여 준다
    const before = new Set(bottles.map((b) => b.id));
    bottles = [coupleBottle(inv), ...visibleEntries()];
    if (before.size) bottles.forEach((b) => { if (!before.has(b.id)) dropAnim[b.id] = performance.now(); });
    resizeCabinet();
    renderStats();
    if (!$('#admin-dialog').hidden && $('#admin-dialog').open) renderAdminList();
  }

  // ───────── 예식 전 / 당일 / 후 ─────────
  // 주소 끝에 ?phase=day 또는 ?phase=after 를 붙이면 그날 화면을 미리 볼 수 있다
  const PHASE_PREVIEW = new URLSearchParams(location.search).get('phase');
  let lastPhase = null;
  function phaseOf(inv) {
    if (PHASE_PREVIEW === 'before' || PHASE_PREVIEW === 'day' || PHASE_PREVIEW === 'after') return PHASE_PREVIEW;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = weddingDate(inv); day.setHours(0, 0, 0, 0);
    return today < day ? 'before' : today > day ? 'after' : 'day';
  }

  // 결혼식 당일에 화면 위로 픽셀 꽃잎이 날린다
  const petalCanvas = $('#petals');
  const PETAL_COLORS = ['#ff7aa8', '#ffd1e0', '#fffaf0', '#f2c14e'];
  let petals = [];
  let petalsOn = false;
  function setPetals(on) {
    if (reduceMotion) on = false;
    if (on === petalsOn) return;
    petalsOn = on;
    petalCanvas.hidden = !on;
    if (!on) return;
    const W = 120, H = Math.round(120 * innerHeight / Math.max(1, innerWidth));
    petalCanvas.width = W; petalCanvas.height = H;
    petals = Array.from({ length: 28 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vy: 0.15 + Math.random() * 0.25, sway: Math.random() * Math.PI * 2,
      c: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
    }));
    requestAnimationFrame(petalLoop);
  }
  function petalLoop() {
    if (!petalsOn || $('#invite').hidden) { petalCanvas.hidden = true; petalsOn = false; return; }
    const g = petalCanvas.getContext('2d');
    const W = petalCanvas.width, H = petalCanvas.height;
    g.clearRect(0, 0, W, H);
    petals.forEach((p) => {
      p.y += p.vy; p.sway += 0.03;
      const x = Math.round(p.x + Math.sin(p.sway) * 3);
      if (p.y > H + 2) { p.y = -2; p.x = Math.random() * W; }
      g.fillStyle = p.c;
      g.fillRect(x, Math.round(p.y), 2, 1);
      g.fillRect(x + (Math.sin(p.sway) > 0 ? 1 : 0), Math.round(p.y) + 1, 1, 1);
    });
    requestAnimationFrame(petalLoop);
  }

  function renderStats() {
    const list = $('#stats-list');
    list.replaceChildren();
    const guests = visibleEntries();
    if (!guests.length) {
      const li = document.createElement('li');
      li.className = 'empty'; li.textContent = '아직 올라온 술이 없어요. 첫 병을 올려 주세요!';
      list.appendChild(li);
      return;
    }
    const counts = {};
    guests.forEach((g) => { counts[g.drink] = (counts[g.drink] || 0) + 1; });
    const max = Math.max(...Object.values(counts));
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([key, n]) => {
      if (!DRINKS[key]) return;
      const li = document.createElement('li');
      const name = document.createElement('span'); name.textContent = DRINKS[key].name;
      const track = document.createElement('div'); track.className = 'bar-track';
      const fill = document.createElement('div'); fill.className = 'bar-fill';
      fill.style.width = (n / max) * 100 + '%'; fill.style.background = DRINKS[key].color;
      track.appendChild(fill);
      const num = document.createElement('span'); num.textContent = n + '병';
      li.append(name, track, num);
      list.appendChild(li);
    });
  }

  // ───────── 메시지 열기 ─────────
  let typing = null;
  function typeText(el, text) {
    clearInterval(typing);
    el.textContent = '';
    let i = 0;
    const chars = Array.from(text);
    typing = setInterval(() => {
      el.textContent += chars[i];
      if (i % 2 === 0 && chars[i].trim()) sfx.blip();
      i++;
      if (i >= chars.length) clearInterval(typing);
    }, 40);
    el.onclick = () => { clearInterval(typing); el.textContent = text; };
  }

  function paintBottle(cv, entry) {
    const h = bottleHeight(entry.drink);
    cv.width = 14; cv.height = h + 2;
    cv.style.width = 14 * 7 + 'px'; cv.style.height = (h + 2) * 7 + 'px';
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    drawBottle(c, entry.drink, { x: 2, y: h + 1, color: entry.color, ribbon: entry.ribbon, sealed: entry.capsule });
  }

  // 메시지 창을 비운다. 열 때와 닫을 때 모두 불러서, 앞서 본 술병의 글이 남지 않게 한다.
  let typeDelay = null;
  function resetMessage() {
    clearTimeout(typeDelay);
    clearInterval(typing);
    const msg = $('#view-message');
    msg.textContent = '';
    msg.onclick = null;
  }

  function openBottle(entry) {
    resetMessage();
    const inv = S.invitation;
    const cv = $('#view-bottle');
    paintBottle(cv, entry);
    cv.classList.remove('pop'); void cv.offsetWidth; cv.classList.add('pop');

    const sideLabel = { groom: '신랑측 하객', bride: '신부측 하객', couple: '오늘의 주인공' }[entry.side] || '';
    const drinkName = (DRINKS[entry.drink] || DRINKS.soju).name;
    $('#view-from').textContent = `${drinkName} · ${entry.nickname} (${sideLabel})`;

    const msg = $('#view-message');
    $('#view-dialog').showModal();
    if (entry.capsule && new Date() < capsuleOpenDate(inv)) {
      const d = capsuleOpenDate(inv);
      msg.textContent = `🕰️ 숙성 중인 메시지예요.\n${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일, 결혼 1주년에 개봉됩니다.`;
      sfx.blip();
    } else {
      sfx.pop();
      typeDelay = setTimeout(() => typeText(msg, String(entry.message || '')), 350);
    }
  }
  $('#view-close').addEventListener('click', () => $('#view-dialog').close());
  // 닫기 버튼, 뒤로 가기, 바깥 누르기 등 어떤 방법으로 닫혀도 글을 지운다
  // (close 알림은 조금 늦게 오므로, 그사이 다른 술병을 열었으면 건드리지 않는다)
  $('#view-dialog').addEventListener('close', () => { if (!$('#view-dialog').open) resetMessage(); });

  // ───────── 술 올리기 ─────────
  const draft = { drink: 'soju', color: null };

  function renderChips() {
    const wrap = $('#drink-chips');
    wrap.replaceChildren();
    Object.entries(DRINKS).forEach(([key, d]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = d.name;
      b.setAttribute('aria-pressed', String(draft.drink === key));
      b.addEventListener('click', () => { draft.drink = key; draft.color = null; renderChips(); renderSwatches(); renderPreview(); });
      wrap.appendChild(b);
    });
  }

  function renderSwatches() {
    const wrap = $('#swatches');
    wrap.replaceChildren();
    [null, ...SWATCHES].forEach((col) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch';
      b.style.background = col || DRINKS[draft.drink].color;
      b.setAttribute('aria-label', col ? `병 색깔 ${col}` : '기본 병 색깔');
      b.setAttribute('aria-pressed', String(draft.color === col));
      b.addEventListener('click', () => { draft.color = col; renderSwatches(); renderPreview(); });
      wrap.appendChild(b);
    });
  }

  function renderPreview() {
    paintBottle($('#preview'), { drink: draft.drink, color: draft.color, ribbon: $('#a-ribbon').checked, capsule: $('#a-capsule').checked });
  }

  function openAdd() {
    if (!S.canWrite) return;
    const f = $('#add-form');
    f.reset();
    const mine = Store.myEntry();
    draft.drink = (mine && DRINKS[mine.drink]) ? mine.drink : 'soju';
    draft.color = mine ? mine.color : null;
    if (mine) {
      $('#a-ribbon').checked = !!mine.ribbon;
      $('#a-capsule').checked = !!mine.capsule;
      $('#a-nickname').value = mine.nickname || '';
      $('#a-side').value = mine.side === 'bride' ? 'bride' : 'groom';
      $('#a-message').value = mine.message || '';
    }
    $('#add-title').textContent = mine ? '🍾 내 술 다시 꾸미기' : '🍾 축하주 한 병 올리기';
    $('#add-note').hidden = S.mode !== 'db';
    renderChips(); renderSwatches(); renderPreview();
    $('#add-dialog').showModal();
  }

  $('#add-btn').addEventListener('click', openAdd);
  $('#add-form').addEventListener('change', renderPreview);
  $('#add-form').addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    const entry = {
      drink: draft.drink,
      color: draft.color,
      ribbon: $('#a-ribbon').checked,
      capsule: $('#a-capsule').checked,
      nickname: $('#a-nickname').value.trim(),
      side: $('#a-side').value,
      message: $('#a-message').value.trim(),
    };
    try {
      const id = await Store.saveEntry(entry);
      dropAnim[id] = performance.now();
      sfx.drop();
      toast(`${DRINKS[entry.drink].name} 한 병이 찬장에 올라갔어요!`);
      canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      const code = e && e.code;
      toast(code === 'invalid_argument' ? '술을 올릴 권한이 없어요. 신랑·신부에게 참여 권한을 받아 주세요.'
        : code === 'auth' ? '하객 로그인이 꺼져 있어요. 신랑·신부에게 알려 주세요.'
        : '술을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.', detailOf(e));
    }
  });

  // ───────── 건배 ─────────
  $('#cheers-btn').addEventListener('click', () => {
    sfx.clink();
    toast('🥂 짠! 두 사람의 앞날에 건배!');
    Store.cheer().catch(() => toast('건배가 저장되지 않았어요.'));
  });

  // ───────── 관리 ─────────
  function renderAdminList() {
    const list = $('#admin-list');
    list.replaceChildren();
    if (!S.entries.length) { list.textContent = '아직 올라온 술이 없어요.'; return; }
    S.entries.forEach((e) => {
      const li = document.createElement('li');
      if (e.hidden) li.classList.add('is-hidden');
      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.textContent = `${(DRINKS[e.drink] || DRINKS.soju).name} · ${e.nickname}: ${e.message}`;
      const btn = document.createElement('button');
      btn.className = 'btn'; btn.textContent = e.hidden ? '보이기' : '숨기기';
      btn.addEventListener('click', () => Store.setHidden(e.id, !e.hidden).catch(() => toast('바꾸지 못했어요.')));
      li.append(txt, btn);
      list.appendChild(li);
    });
  }

  let resetArmed = false;
  function disarmReset() { resetArmed = false; $('#admin-reset').textContent = '청첩장 전체 지우기'; }

  $('#admin-btn').addEventListener('click', () => { disarmReset(); renderAdminList(); $('#admin-dialog').showModal(); });
  $('#admin-close').addEventListener('click', () => $('#admin-dialog').close());
  $('#admin-edit').addEventListener('click', () => { $('#admin-dialog').close(); editing = true; openSetup(); });
  $('#admin-reset').addEventListener('click', async () => {
    // 브라우저 확인창 대신 버튼을 한 번 더 누르게 한다
    if (!resetArmed) { resetArmed = true; $('#admin-reset').textContent = '정말 지울까요? 한 번 더 누르면 모두 지워져요'; return; }
    disarmReset();
    $('#admin-dialog').close();
    try {
      await Store.reset();
      toast('청첩장을 지웠어요.');
      if (S.mode === 'sb') location.assign(location.pathname);
    } catch (e) { toast('지우지 못했어요.'); }
  });

  // ───────── 청첩장 만들기 / 고치기 ─────────
  function openSetup() {
    const sel = $('#f-favorite');
    if (!sel.options.length) {
      Object.entries(DRINKS).forEach(([key, d]) => {
        const o = document.createElement('option');
        o.value = key; o.textContent = d.name;
        sel.appendChild(o);
      });
    }
    const bgmSel = $('#f-bgm');
    if (!bgmSel.options.length) {
      [['', '없음'], ...Object.entries(SONGS).map(([key, s]) => [key, `${s.title} · ${s.composer}`])].forEach(([key, label]) => {
        const o = document.createElement('option');
        o.value = key; o.textContent = label;
        bgmSel.appendChild(o);
      });
    }
    const inv = S.invitation;
    const f = $('#setup-form');
    f.reset();
    sel.value = 'wine';
    bgmSel.value = inv ? '' : 'canon';
    if (inv) SETUP_FIELDS.forEach((k) => { if (inv[k] != null) $('#f-' + k).value = inv[k]; });
    $('#setup-title').textContent = inv ? '🍶 청첩장 정보 고치기' : '🍶 우리 술장 청첩장 만들기';
    $('#setup-submit').textContent = inv ? '고친 내용 저장하기' : '청첩장 만들기';
    $('#setup-cancel').hidden = !inv && !creating;
    $('#demo-btn').hidden = !!inv || creating;
    show('#setup');
  }

  $('#setup-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const data = {};
    SETUP_FIELDS.forEach((k) => { data[k] = $('#f-' + k).value.trim(); });
    $('#setup-submit').disabled = true;
    stopPreview();
    try {
      const newId = await Store.saveInvitation(data);
      if (Store.takeWarning() === 'bgm-column-missing') {
        toast('청첩장은 저장했지만 배경음악은 저장하지 못했어요. Supabase에 bgm 칸을 추가해 주세요.');
        if (newId) { setTimeout(() => location.assign(Store.shareUrl(newId)), 4000); return; }
      }
      if (newId) { location.assign(Store.shareUrl(newId)); return; }
      editing = false;
      render(Store.state);
      toast('청첩장을 저장했어요!');
    } catch (e) {
      toast(e && e.code === 'forbidden' ? '저장할 권한이 없어요. 이메일로 다시 로그인해 주세요.' : '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', detailOf(e));
    } finally {
      $('#setup-submit').disabled = false;
    }
  });
  $('#setup-cancel').addEventListener('click', () => { stopPreview(); editing = false; creating = false; render(Store.state); });

  // ───────── 배경음악 ─────────
  const BGM_MUTE_KEY = 'pixel-bar-bgm-muted';
  let previewing = false;   // 만들기 화면에서 미리 듣는 중
  let pausedByHide = null;  // 다른 앱으로 나가서 잠시 멈춘 곡

  const bgmMuted = () => { try { return localStorage.getItem(BGM_MUTE_KEY) === '1'; } catch (e) { return false; } };
  const setBgmMuted = (v) => { try { localStorage.setItem(BGM_MUTE_KEY, v ? '1' : '0'); } catch (e) { /* 무시 */ } };
  function currentBgm() {
    const key = S.invitation && S.invitation.bgm;
    return key && SONGS[key] ? key : null;
  }

  function renderBgmButton() {
    const btn = $('#bgm-btn');
    const key = currentBgm();
    btn.hidden = $('#invite').hidden || !key;
    if (btn.hidden) return;
    const on = Chiptune.playing === key;
    btn.textContent = on ? `♪ ${SONGS[key].title} · 끄기` : '♪ 배경음악 켜기';
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? '배경음악 끄기' : '배경음악 켜기');
  }

  function startBgm() {
    const key = currentBgm();
    if (key && Chiptune.playing !== key) Chiptune.play(key);
    renderBgmButton();
  }

  $('#bgm-btn').addEventListener('click', () => {
    if (Chiptune.playing) { Chiptune.stop(); setBgmMuted(true); } else { setBgmMuted(false); startBgm(); }
    renderBgmButton();
  });

  // 브라우저는 사람이 화면을 한 번 만진 뒤에만 소리를 낼 수 있다. 그래서 첫 터치에 음악을 켠다.
  document.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest && ev.target.closest('#bgm-btn')) return;
    if (!$('#invite').hidden && currentBgm() && !bgmMuted() && !Chiptune.playing) startBgm();
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (Chiptune.playing) { pausedByHide = Chiptune.playing; Chiptune.stop(); }
    } else if (pausedByHide) {
      Chiptune.play(pausedByHide); pausedByHide = null;
      renderBgmButton();
    }
  });

  function renderPreviewButton() {
    $('#bgm-preview').textContent = previewing ? '■ 멈추기' : '▶ 미리 듣기';
  }
  function stopPreview() {
    if (previewing) Chiptune.stop();
    previewing = false;
    renderPreviewButton();
  }
  $('#bgm-preview').addEventListener('click', () => {
    if (previewing) { stopPreview(); return; }
    const key = $('#f-bgm').value;
    if (!key) { toast('배경음악을 먼저 골라 주세요.'); return; }
    previewing = Chiptune.play(key);
    renderPreviewButton();
  });
  $('#f-bgm').addEventListener('change', () => {
    if (!previewing) return;
    const key = $('#f-bgm').value;
    if (key) Chiptune.play(key); else stopPreview();
  });

  // ───────── Supabase 첫 화면 ─────────
  function renderHome() {
    const email = S.home.email;
    $('#home-login').hidden = !!email;
    $('#home-mine').hidden = !email;
    if (!email) return;
    $('#home-email').textContent = email;
    const list = $('#my-list');
    list.replaceChildren();
    S.home.myInvitations.forEach((inv) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = Store.shareUrl(inv.id);
      const names = document.createElement('span'); names.textContent = `${inv.groom} ♥ ${inv.bride}`;
      const date = document.createElement('span'); date.textContent = inv.wedding_date;
      a.append(names, date);
      // 지우기: 실수로 지우지 않게 한 번 더 눌러야 지워진다
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'btn danger del'; del.textContent = '삭제';
      del.setAttribute('aria-label', `${inv.groom} ♥ ${inv.bride} 청첩장 삭제`);
      del.addEventListener('click', async () => {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1'; del.textContent = '정말 삭제';
          setTimeout(() => { if (del.isConnected) { del.dataset.armed = ''; del.textContent = '삭제'; } }, 4000);
          return;
        }
        del.disabled = true; del.textContent = '삭제 중…';
        try {
          await Store.deleteInvitation(inv.id);
          toast(`${inv.groom} ♥ ${inv.bride} 청첩장을 지웠어요. 하객이 올린 술도 함께 지워졌어요.`);
        } catch (e) {
          del.disabled = false; del.dataset.armed = ''; del.textContent = '삭제';
          toast('청첩장을 지우지 못했어요.', detailOf(e));
        }
      });
      li.append(a, del);
      list.appendChild(li);
    });
  }

  $('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('#login-email').value.trim();
    $('#login-submit').disabled = true;
    try {
      await Store.sendLoginLink(email);
      $('#login-sent').hidden = false;
    } catch (e) {
      if (/rate_limit|rate limit/i.test(detailOf(e))) {
        // Supabase 기본 메일은 한 시간에 몇 통만 보낼 수 있다
        toast('로그인 메일을 너무 자주 요청했어요. 이미 받은 메일의 링크를 누르거나, 한 시간쯤 뒤에 다시 시도해 주세요.');
      } else {
        toast('로그인 메일을 보내지 못했어요. 주소를 확인하고 잠시 뒤 다시 시도해 주세요.', detailOf(e));
      }
    } finally {
      $('#login-submit').disabled = false;
    }
  });
  $('#logout-btn').addEventListener('click', () => Store.signOut());
  $('#new-invite-btn').addEventListener('click', () => { creating = true; render(Store.state); });
  $('#home-demo').addEventListener('click', () => startDemo());
  $('#share-copy').addEventListener('click', () => copyText(Store.shareUrl()));

  // ───────── 예시 화면 ─────────
  function startDemo() {
    const d = new Date(); d.setDate(d.getDate() + 38);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const demo = [
      ['soju', null, false, false, '대학동기 민수', 'groom', '새내기 때 MT에서 소주 한 짝 비우던 철수가 장가를 가다니... 영희 씨 철수 잘 부탁해요! 결혼 축하한다 🎉'],
      ['wine', '#6b1430', true, false, '지은', 'bride', '영희야 결혼 너무너무 축하해! 둘이 와인 마시면서 오래오래 행복하게 살아 💕'],
      ['beer', null, false, false, '회사 박대리', 'groom', '팀장님 결혼 축하드립니다! 신혼여행 다녀오시면 맥주 한잔 하시죠 🍺'],
      ['makgeolli', null, false, false, '할머니', 'bride', '우리 강아지 시집 가는구나. 건강하고 행복하게 살거라.'],
      ['champagne', null, true, false, '수진', 'bride', '드디어!!! 축하해 🥂 부케는 내가 받는다!'],
      ['whisky', null, false, true, '형준', 'groom', '1년 뒤에 읽어 줘. 그때도 지금처럼 웃고 있길.'],
      ['cocktail', '#7d5ba6', false, false, '요가 친구 하나', 'bride', '언니 결혼 축하해요! 칵테일처럼 달콤한 신혼 되세요 🍸'],
      ['sake', null, false, false, '일본 출장 동료', 'groom', 'おめでとう! 결혼 진심으로 축하해요.'],
      ['soju', '#4a7bd1', false, false, '동네 친구들', 'groom', '야 결혼식 끝나고 2차는 우리 동네 포차다'],
      ['wine', '#efeadc', false, false, '사촌 오빠', 'bride', '화이트와인처럼 맑고 깔끔하게! 축하한다 영희야'],
    ].map(([drink, color, ribbon, capsule, nickname, side, message]) => ({ drink, color, ribbon, capsule, nickname, side, message }));
    bottles = [];
    editing = false;
    Store.startDemo({
      groom: '김철수', bride: '이영희', date: iso, time: '12:30',
      venue: '픽셀웨딩홀 3층 그랜드홀', address: '서울특별시 중구 세종대로 110',
      groomAccount: '픽셀은행 123-456-7890 김철수', brideAccount: '도트은행 098-765-4321 이영희',
      greeting: DEFAULT_GREETING, favorite: 'wine', bgm: 'canon', hidden: [],
    }, demo);
    window.scrollTo(0, 0);
  }
  $('#demo-btn').addEventListener('click', startDemo);
  $('#closed-demo').addEventListener('click', startDemo);
  $('#demo-exit').addEventListener('click', () => { bottles = []; Store.stopDemo(); window.scrollTo(0, 0); });

  window.addEventListener('resize', () => { if (!$('#invite').hidden) resizeCabinet(); });

  // 체험 모드: 안내 문구를 보이고, 계좌 칸 예시를 가짜 계좌로 바꾼다
  if ((window.PIXEL_BAR_CONFIG || {}).trialMode) {
    document.querySelectorAll('[data-trial]').forEach((el) => { el.hidden = false; });
    $('#f-groomAccount').placeholder = '예시) 체험은행 000-0000-0000 신랑';
    $('#f-brideAccount').placeholder = '예시) 체험은행 000-0000-0000 신부';
  }

  Store.subscribe(render);
  Store.init();
  requestAnimationFrame(loop);
})();
