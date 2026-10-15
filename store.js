// 데이터 저장소. 실행 환경에 따라 하나의 방식으로 동작한다.
//  - sb   : config.js 에 Supabase 주소와 키가 있을 때. 정식 서비스용. (supabase/schema.sql 참고)
//  - db   : claude.ai 아티팩트로 열었을 때. 아티팩트의 공유 DB에 저장된다.
//  - local: 파일을 브라우저로 직접 열었을 때. 이 브라우저(localStorage)에만 저장된다.
//  - demo : "예시 화면". 메모리에만 있고 저장되지 않는다.
//
// 화면은 Store.subscribe 로 받은 상태만 보고 그린다. 상태의 mode 값:
//   loading / local / db / nodb / demo
//   sb (청첩장 하나를 보는 중) / sb-home (청첩장 주소 없이 들어옴) / sb-notfound (없는 청첩장) / sb-error
const Store = (() => {
  const LOCAL_KEY = 'pixel-bar-invitation:v1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const listeners = new Set();

  let mode = 'loading';
  let caps = { canWrite: false, isAdmin: false, myId: null };
  let live = { invitation: null, entries: [], cheers: {} };
  let home = { email: null, myInvitations: [] }; // Supabase 첫 화면용
  let demo = null; // 예시 화면일 때 { raw, caps }

  // 지금 화면에 보여 줄 데이터. 예시 화면이면 예시 데이터, 아니면 실제 데이터.
  const cur = () => (demo ? demo.raw : live);

  function snapshot() {
    const raw = cur();
    const inv = raw.invitation;
    const hidden = new Set((inv && inv.hidden) || []);
    const entries = raw.entries
      .map((e) => ({ ...e, hidden: hidden.has(e.id) }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const cheersTotal = Object.values(raw.cheers).reduce((s, n) => s + (Number(n) || 0), 0);
    return {
      mode: demo ? 'demo' : mode,
      ...(demo ? demo.caps : caps),
      invitation: inv,
      entries,
      cheersTotal,
      home,
    };
  }
  const emit = () => { const s = snapshot(); listeners.forEach((fn) => fn(s)); };

  // 같은 대상에 한 번에 하나씩만 쓰도록 줄 세운다
  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn, fn));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ═════════ local ═════════
  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (saved) live = { invitation: saved.invitation || null, entries: saved.entries || [], cheers: saved.cheers || {} };
    } catch (e) { /* 저장소를 못 쓰면 메모리로만 동작 */ }
  }
  function saveLocal() {
    if (demo || mode !== 'local') return;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(live)); } catch (e) { /* 무시 */ }
  }

  // ═════════ db (claude.ai 아티팩트) ═════════
  //   invite/main        청첩장 정보 + 숨긴 술병 id 목록. 편집 권한자만 쓴다.
  //   entries/<하객 id>  하객 한 명당 술 한 병. 본인만 쓴다.
  //   cheers/<하객 id>   하객별 건배 횟수. 본인만 쓴다.
  let db = null;

  async function initDb() {
    const [dbNs, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!dbNs) { mode = 'nodb'; emit(); return; }
    db = dbNs;
    const myId = user ? await user.id() : null;
    const isAdmin = user ? await user.canEdit() : false;
    caps = { canWrite: !!myId, isAdmin, myId };

    let inviteLoaded = false;
    const onErr = (e) => { console.warn('db', e && e.code); if (e && e.code === 'revoked') { mode = 'nodb'; emit(); } };
    db.doc('invite/main').onSnapshot((s) => {
      live.invitation = s.exists ? s.data() : null;
      if (!inviteLoaded) { inviteLoaded = true; mode = 'db'; }
      emit();
    }, onErr);
    db.collection('entries').onSnapshot((q) => {
      live.entries = q.docs.map((d) => ({ ...d.data(), id: d.id }));
      if (inviteLoaded) emit();
    }, onErr);
    db.collection('cheers').onSnapshot((q) => {
      const c = {};
      q.docs.forEach((d) => { c[d.id] = (d.data() || {}).count || 0; });
      live.cheers = c;
      if (inviteLoaded) emit();
    }, onErr);
  }

  // 쓰기가 거절되면(권한 부족) 읽기 전용으로 바꾼다
  async function dbGuarded(fn) {
    try { return await fn(); } catch (e) {
      if (e && e.code === 'invalid_argument') { caps = { ...caps, canWrite: false }; emit(); }
      throw e;
    }
  }

  // ═════════ sb (Supabase) ═════════
  let sb = null;
  let inviteId = null;
  let session = null;

  const fromInviteRow = (r) => ({
    groom: r.groom, bride: r.bride,
    date: r.wedding_date, time: String(r.wedding_time || '12:00').slice(0, 5),
    venue: r.venue, address: r.address || '',
    groomAccount: r.groom_account || '', brideAccount: r.bride_account || '',
    greeting: r.greeting || '', favorite: r.favorite || 'wine', bgm: r.bgm || '',
    hidden: r.hidden || [], ownerId: r.owner_id,
  });
  const toInviteRow = (inv) => ({
    groom: inv.groom, bride: inv.bride,
    wedding_date: inv.date, wedding_time: inv.time || '12:00',
    venue: inv.venue, address: inv.address || null,
    groom_account: inv.groomAccount || null, bride_account: inv.brideAccount || null,
    greeting: inv.greeting || null, favorite: inv.favorite || 'wine',
    bgm: inv.bgm || null,
  });

  // 배경음악 칸(bgm)이 없는 예전 DB면 그 칸만 빼고 다시 저장한다
  let warning = null;
  const missingBgmColumn = (e) => /bgm/.test((e && e.message) || '');
  async function writeInvitation(write) {
    try { return await write(true); } catch (e) {
      if (!missingBgmColumn(e)) throw e;
      warning = 'bgm-column-missing';
      return write(false);
    }
  }
  const inviteRow = (inv, withBgm) => {
    const row = toInviteRow(inv);
    if (!withBgm) delete row.bgm;
    return row;
  };
  const fromEntryRow = (r) => ({
    id: r.id, authorId: r.author_id,
    drink: r.drink, color: r.color, ribbon: r.ribbon, capsule: r.capsule,
    nickname: r.nickname, side: r.side, message: r.message,
    createdAt: Date.parse(r.created_at) || 0,
  });

  // Supabase 오류를 화면에서 쓰는 모양으로 바꾼다
  function sbError(error) {
    const err = new Error(error.message || 'supabase error');
    err.detail = [error.code, error.message].filter(Boolean).join(' · ');
    err.code = error.code === '42501' || /row-level security|permission/i.test(error.message || '') ? 'forbidden' : 'failed';
    return err;
  }
  async function sbRun(promise) {
    const { data, error } = await promise;
    if (error) throw sbError(error);
    return data;
  }

  function applySession(s) {
    session = s;
    const user = s && s.user;
    const myId = user ? user.id : null;
    const inv = live.invitation;
    caps = { canWrite: true, isAdmin: !!(myId && inv && inv.ownerId === myId), myId };
    home = { ...home, email: user && !user.is_anonymous ? (user.email || '') : null };
  }

  // 하객이 처음 무언가를 쓸 때 익명으로 로그인시킨다
  async function ensureGuestSession() {
    if (session && session.user) return session.user.id;
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) { const e = sbError(error); e.code = 'auth'; throw e; }
    applySession(data.session);
    return data.session.user.id;
  }

  async function fetchInvitation() {
    const row = await sbRun(sb.from('invitations').select('*').eq('id', inviteId).maybeSingle());
    live.invitation = row ? fromInviteRow(row) : null;
    applySession(session);
  }
  async function fetchEntries() {
    const rows = await sbRun(sb.from('entries').select('*').eq('invitation_id', inviteId).order('created_at'));
    live.entries = rows.map(fromEntryRow);
  }
  async function fetchCheers() {
    const rows = await sbRun(sb.from('cheers').select('author_id,count').eq('invitation_id', inviteId));
    const c = {};
    rows.forEach((r) => { c[r.author_id] = r.count; });
    live.cheers = c;
  }
  async function fetchMyInvitations() {
    if (!home.email || !session) { home = { ...home, myInvitations: [] }; return; }
    const rows = await sbRun(sb.from('invitations').select('id,groom,bride,wedding_date')
      .eq('owner_id', session.user.id).order('created_at', { ascending: false }));
    home = { ...home, myInvitations: rows };
  }

  // 실시간 알림이 몰려 와도 0.3초에 한 번만 다시 읽는다
  const pending = new Set();
  let refetchTimer = null;
  function refetchSoon(...what) {
    what.forEach((w) => pending.add(w));
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(async () => {
      const jobs = [...pending]; pending.clear();
      try {
        if (jobs.includes('invitation')) await fetchInvitation();
        if (jobs.includes('entries')) await fetchEntries();
        if (jobs.includes('cheers')) await fetchCheers();
      } catch (e) { console.warn('refetch', e); }
      if (mode === 'sb' && !live.invitation) mode = 'sb-notfound';
      emit();
    }, 300);
  }

  async function initSb(cfg) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const id = new URLSearchParams(location.search).get('i');
    inviteId = id && UUID.test(id) ? id : null;

    const { data } = await sb.auth.getSession();
    applySession(data.session);
    sb.auth.onAuthStateChange((_event, s) => {
      const before = session && session.user && session.user.id;
      applySession(s);
      const after = s && s.user && s.user.id;
      if (before === after) { emit(); return; }
      if (mode === 'sb-home') fetchMyInvitations().then(emit, emit);
      else if (mode === 'sb') refetchSoon('invitation', 'entries');
      else emit();
    });

    if (!id) {
      mode = 'sb-home';
      await fetchMyInvitations().catch(() => {});
      emit();
      return;
    }
    if (!inviteId) { mode = 'sb-notfound'; emit(); return; }

    await fetchInvitation();
    if (!live.invitation) { mode = 'sb-notfound'; emit(); return; }
    await Promise.all([fetchEntries(), fetchCheers()]);
    mode = 'sb';
    emit();

    const filter = (col) => ({ schema: 'public', filter: `${col}=eq.${inviteId}` });
    sb.channel('invitation-' + inviteId)
      .on('postgres_changes', { event: '*', table: 'invitations', ...filter('id') }, () => refetchSoon('invitation', 'entries'))
      .on('postgres_changes', { event: '*', table: 'entries', ...filter('invitation_id') }, () => refetchSoon('entries'))
      .on('postgres_changes', { event: '*', table: 'cheers', ...filter('invitation_id') }, () => refetchSoon('cheers'))
      .subscribe();
  }

  // ═════════ 공개 함수 ═════════
  const isDb = () => !demo && mode === 'db';
  const isSb = () => !demo && (mode === 'sb' || mode === 'sb-home');

  return {
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    get state() { return snapshot(); },

    init() {
      const cfg = window.PIXEL_BAR_CONFIG || {};
      if (window.__ARTIFACT__) {
        // 아티팩트용으로 빌드한 파일이면 공유 DB가 준비될 때까지 최대 10초 기다린다
        const started = Date.now();
        const wait = () => {
          if (window.claude && typeof window.claude.use === 'function') initDb().catch(() => { mode = 'nodb'; emit(); });
          else if (Date.now() - started > 10000) { mode = 'nodb'; emit(); }
          else setTimeout(wait, 50);
        };
        wait();
      } else if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
        initSb(cfg).catch((e) => { console.error(e); mode = 'sb-error'; emit(); });
      } else {
        loadLocal();
        mode = 'local';
        caps = { canWrite: true, isAdmin: true, myId: null };
        emit();
      }
    },

    // 하객 본인의 술 (서버 모드에서는 청첩장마다 한 사람당 한 병)
    myEntry() {
      if (demo || !caps.myId) return null;
      if (mode === 'db') return live.entries.find((e) => e.id === caps.myId) || null;
      if (mode === 'sb') return live.entries.find((e) => e.authorId === caps.myId) || null;
      return null;
    },

    // 저장하면서 생긴 알림을 한 번만 꺼내 간다 (예: 'bgm-column-missing')
    takeWarning() { const w = warning; warning = null; return w; },

    // 하객에게 보낼 링크 (Supabase 모드에서만 청첩장마다 다르다)
    shareUrl(id = inviteId) {
      return id ? `${location.origin}${location.pathname}?i=${id}` : location.href;
    },

    // 청첩장 저장. 새로 만든 Supabase 청첩장이면 그 id를 돌려준다.
    async saveInvitation(inv) {
      if (isSb()) {
        if (mode === 'sb' && live.invitation) {
          await writeInvitation((withBgm) => sbRun(sb.from('invitations').update(inviteRow(inv, withBgm)).eq('id', inviteId)));
          await fetchInvitation(); emit();
          return null;
        }
        const row = await writeInvitation((withBgm) => sbRun(sb.from('invitations').insert(inviteRow(inv, withBgm)).select('id').single()));
        return row.id;
      }
      const body = { ...inv, hidden: (cur().invitation && cur().invitation.hidden) || [] };
      if (isDb()) return queue(() => dbGuarded(() => db.doc('invite/main').set(body)));
      cur().invitation = body; saveLocal(); emit();
      return null;
    },

    async saveEntry(entry) {
      if (isDb()) {
        const prev = this.myEntry();
        const body = { ...entry, createdAt: prev ? prev.createdAt : Date.now(), updatedAt: Date.now() };
        await queue(() => dbGuarded(() => db.doc('entries/' + caps.myId).set(body)));
        return caps.myId;
      }
      if (isSb()) {
        const myId = await ensureGuestSession();
        const row = await sbRun(sb.from('entries').upsert({
          invitation_id: inviteId, author_id: myId,
          drink: entry.drink, color: entry.color, ribbon: entry.ribbon, capsule: entry.capsule,
          nickname: entry.nickname, side: entry.side, message: entry.message,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'invitation_id,author_id' }).select('*').single());
        const saved = fromEntryRow(row);
        live.entries = [...live.entries.filter((e) => e.id !== saved.id), saved];
        emit();
        return saved.id;
      }
      const id = newId();
      cur().entries.push({ ...entry, id, createdAt: Date.now() });
      saveLocal(); emit();
      return id;
    },

    async cheer() {
      if (isDb() || isSb()) {
        const myId = isSb() ? await ensureGuestSession() : caps.myId;
        const next = (live.cheers[myId] || 0) + 1;
        live.cheers = { ...live.cheers, [myId]: next };
        emit();
        if (isDb()) return queue(() => dbGuarded(() => db.doc('cheers/' + myId).set({ count: next })));
        return queue(() => sbRun(sb.from('cheers').upsert(
          { invitation_id: inviteId, author_id: myId, count: next },
          { onConflict: 'invitation_id,author_id' },
        )));
      }
      cur().cheers = { ...cur().cheers, me: (cur().cheers.me || 0) + 1 };
      saveLocal(); emit();
    },

    async setHidden(id, hidden) {
      const list = new Set((cur().invitation && cur().invitation.hidden) || []);
      if (hidden) list.add(id); else list.delete(id);
      if (isDb()) return queue(() => dbGuarded(() => db.doc('invite/main').update({ hidden: [...list] })));
      if (isSb()) {
        await sbRun(sb.from('invitations').update({ hidden: [...list] }).eq('id', inviteId));
        live.invitation = { ...live.invitation, hidden: [...list] };
        emit();
        return;
      }
      cur().invitation = { ...cur().invitation, hidden: [...list] }; saveLocal(); emit();
    },

    async reset() {
      if (isDb()) {
        for (const e of live.entries) await db.doc('entries/' + e.id).delete();
        for (const id of Object.keys(live.cheers)) await db.doc('cheers/' + id).delete();
        await db.doc('invite/main').delete();
        return;
      }
      if (isSb()) {
        // 술과 건배는 DB에서 함께 지워진다 (on delete cascade)
        await sbRun(sb.from('invitations').delete().eq('id', inviteId));
        return;
      }
      live = { invitation: null, entries: [], cheers: {} };
      saveLocal(); emit();
    },

    // ───────── Supabase 신랑·신부 로그인 ─────────
    async sendLoginLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
      });
      if (error) throw sbError(error);
    },
    // 첫 화면의 내 청첩장 목록에서 하나를 지운다 (술과 건배는 DB에서 함께 지워진다)
    async deleteInvitation(id) {
      await sbRun(sb.from('invitations').delete().eq('id', id));
      await fetchMyInvitations();
      emit();
    },

    async signOut() {
      await sb.auth.signOut();
      applySession(null);
      home = { email: null, myInvitations: [] };
      emit();
    },

    // 예시 화면: 실제 데이터는 건드리지 않고 메모리에서만 보여 준다
    startDemo(invitation, entries) {
      demo = {
        caps: { canWrite: true, isAdmin: false, myId: null },
        raw: { invitation, entries: entries.map((e, i) => ({ ...e, id: 'demo' + i, createdAt: i })), cheers: { demo: 27 } },
      };
      emit();
    },
    stopDemo() { demo = null; emit(); },
  };
})();
