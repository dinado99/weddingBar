// 8비트 배경음악. 음원 파일 없이 브라우저에서 사각파(멜로디)와 삼각파(베이스)로 연주한다.
// 모두 저작권이 끝난 클래식 곡을 짧게 편곡한 것이다.
// 악보 표기: "음이름옥타브:박자" (R = 쉼표, | 는 마디 구분용으로 무시).
// 멜로디와 베이스의 박자 합이 같아야 반복할 때 어긋나지 않는다.
const SONGS = {
  canon: {
    title: '캐논 변주곡', composer: '파헬벨', bpm: 72,
    lead: `F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2
           D5:2 C#5:2 B4:2 A4:2 G4:2 F#4:2 G4:2 E4:2
           A5:1 F#5:.5 G5:.5 A5:1 F#5:.5 G5:.5 A5:.5 A4:.5 B4:.5 C#5:.5 D5:.5 E5:.5 F#5:.5 G5:.5
           F#5:1 D5:.5 E5:.5 F#5:1 F#4:.5 G4:.5 A4:.5 B4:.5 A4:.5 G4:.5 A4:.5 F#4:.5 G4:.5 A4:.5
           G4:1 B4:.5 A4:.5 G4:1 F#4:.5 E4:.5 F#4:.5 E4:.5 D4:.5 E4:.5 F#4:.5 G4:.5 A4:.5 B4:.5
           G4:1 B4:.5 A4:.5 B4:1 C#5:.5 D5:.5 A4:.5 B4:.5 C#5:.5 D5:.5 E5:.5 F#5:.5 G5:.5 A5:.5`,
    bass: `D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2
           D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2
           D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2
           D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2`,
  },
  bridal: {
    title: '혼례의 합창 (신부 입장)', composer: '바그너', bpm: 76,
    lead: `C4:1 F4:1.5 F4:.5 F4:3
           C4:1 G4:1.5 E4:.5 F4:3
           C4:1 F4:1.5 Bb4:.5 Bb4:2 A4:1.5 G4:.5 F4:2 E4:1.5 F4:.5 G4:3`,
    bass: `F2:3 F2:3
           C3:3 F2:3
           F2:1 Bb2:4 F2:4 C3:5`,
  },
  air: {
    title: 'G선상의 아리아', composer: '바흐', bpm: 56,
    lead: `F#5:4.5 B5:.5 G5:.25 E5:.25 D5:.25 C#5:.25 D5:.5 C#5:.5 B4:.25 A4:.25 A5:3 G5:.5 F#5:.5 E5:.5`,
    bass: `D3:.5 D2:.5 C#3:.5 C#2:.5 B2:.5 B1:.5 A2:.5 A1:.5
           G2:.5 G1:.5 F#2:.5 F#1:.5 G2:.5 G1:.5 E2:.5 E1:.5
           A2:.5 A1:.5 A2:.5 A1:.5 D3:.5 D2:.5 D3:.5 D2:.5`,
  },
  jesu: {
    title: '예수, 인간 소망의 기쁨', composer: '바흐', bpm: 96,
    lead: `G4:.333 A4:.333 B4:.334 D5:.333 C5:.333 C5:.334 E5:.333 D5:.333 D5:.334 G5:.333 F#5:.333 G5:.334
           D5:.333 B4:.333 G4:.334 A4:.333 B4:.333 C5:.334 D5:.333 E5:.333 D5:.334 C5:.333 B4:.333 A4:.334
           B4:.333 G4:.333 F#4:.334 G4:.333 A4:.333 D4:.334 F#4:.333 A4:.333 C5:.334 B4:.333 A4:.333 B4:.334`,
    bass: `G2:1 A2:1 B2:1 B2:1
           G2:1 F#2:1 G2:1 A2:1
           G2:1 D2:1 D2:1 G2:1`,
  },
  ode: {
    title: '환희의 송가', composer: '베토벤', bpm: 112,
    lead: `E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | E4:1.5 D4:.5 D4:2
           E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:.5 C4:2`,
    bass: `C3:4 G2:4 C3:4 G2:4
           C3:4 G2:4 C3:4 G2:2 C3:2`,
  },
  spring: {
    title: '사계 중 봄', composer: '비발디', bpm: 104,
    lead: `E4:1 | G#4:1 G#4:1 G#4:1 F#4:.5 E4:.5 | B4:3 B4:.5 A4:.5
           G#4:1 G#4:1 G#4:1 F#4:.5 E4:.5 | B4:3 B4:.5 A4:.5
           G#4:1 A4:.5 B4:.5 A4:1 G#4:1 | F#4:1 D#4:1 B3:1`,
    bass: `E3:1 | E3:4 | E3:4 | E3:4 | E3:4 | E3:2 A2:2 | B2:3`,
  },
  nacht: {
    title: '아이네 클라이네 나흐트무지크', composer: '모차르트', bpm: 120,
    lead: `G5:1 R:.5 D5:.5 G5:1 R:.5 D5:.5 | G5:.5 D5:.5 G5:.5 B5:.5 D6:2
           C6:1 R:.5 A5:.5 C6:1 R:.5 A5:.5 | C6:.5 A5:.5 F#5:.5 A5:.5 D5:2
           G5:1 B5:.5 A5:.5 G5:.5 G5:.5 F#5:1 | A5:.5 C6:.5 F#5:.5 A5:.5 G5:2`,
    bass: `G2:4 G2:4 D3:4 D3:4 G2:2 D3:2 D3:2 G2:2`,
  },
  minuet: {
    title: '미뉴에트 G장조', composer: '바흐(페촐트)', bpm: 126,
    lead: `D5:1 G4:.5 A4:.5 B4:.5 C5:.5 | D5:1 G4:1 G4:1 | E5:1 C5:.5 D5:.5 E5:.5 F#5:.5 | G5:1 G4:1 G4:1
           C5:1 D5:.5 C5:.5 B4:.5 A4:.5 | B4:1 C5:.5 B4:.5 A4:.5 G4:.5 | F#4:1 G4:.5 A4:.5 B4:.5 G4:.5 | A4:3
           D5:1 G4:.5 A4:.5 B4:.5 C5:.5 | D5:1 G4:1 G4:1 | E5:1 C5:.5 D5:.5 E5:.5 F#5:.5 | G5:1 G4:1 G4:1
           C5:1 D5:.5 C5:.5 B4:.5 A4:.5 | B4:1 C5:.5 B4:.5 A4:.5 G4:.5 | A4:1 B4:.5 A4:.5 G4:.5 F#4:.5 | G4:3`,
    bass: `G2:3 B2:3 C3:3 B2:3 A2:3 G2:3 D3:3 D2:3
           G2:3 B2:3 C3:3 B2:3 A2:3 G2:3 D3:3 G2:3`,
  },
  grace: {
    title: '어메이징 그레이스', composer: '영국 민요', bpm: 84,
    lead: `D4:1 | G4:2 B4:.5 G4:.5 | B4:2 A4:1 | G4:2 E4:1 | D4:2 D4:1 | G4:2 B4:.5 G4:.5 | B4:2 A4:1 | D5:3
           D5:2 B4:1 | D5:1.5 B4:.5 D5:.5 B4:.5 | G4:2 D4:1 | E4:1.5 G4:.5 G4:.5 E4:.5 | D4:2 D4:1 | G4:2 B4:.5 G4:.5 | B4:2 A4:1 | G4:2`,
    bass: `D3:1 | G2:3 | G2:3 | C3:3 | G2:3 | G2:3 | D3:3 | D3:3
           G2:3 | G2:3 | G2:3 | C3:3 | G2:3 | G2:3 | D3:3 | G2:2`,
  },
  prelude: {
    title: '평균율 프렐류드 C장조', composer: '바흐', bpm: 66,
    lead: `C4:.25 E4:.25 G4:.25 C5:.25 E5:.25 G4:.25 C5:.25 E5:.25 C4:.25 E4:.25 G4:.25 C5:.25 E5:.25 G4:.25 C5:.25 E5:.25
           C4:.25 D4:.25 A4:.25 D5:.25 F5:.25 A4:.25 D5:.25 F5:.25 C4:.25 D4:.25 A4:.25 D5:.25 F5:.25 A4:.25 D5:.25 F5:.25
           B3:.25 D4:.25 G4:.25 D5:.25 F5:.25 G4:.25 D5:.25 F5:.25 B3:.25 D4:.25 G4:.25 D5:.25 F5:.25 G4:.25 D5:.25 F5:.25
           C4:.25 E4:.25 G4:.25 C5:.25 E5:.25 G4:.25 C5:.25 E5:.25 C4:.25 E4:.25 G4:.25 C5:.25 E5:.25 G4:.25 C5:.25 E5:.25
           C4:.25 E4:.25 A4:.25 E5:.25 A5:.25 A4:.25 E5:.25 A5:.25 C4:.25 E4:.25 A4:.25 E5:.25 A5:.25 A4:.25 E5:.25 A5:.25
           C4:.25 D4:.25 F#4:.25 A4:.25 D5:.25 F#4:.25 A4:.25 D5:.25 C4:.25 D4:.25 F#4:.25 A4:.25 D5:.25 F#4:.25 A4:.25 D5:.25
           B3:.25 D4:.25 G4:.25 D5:.25 G5:.25 G4:.25 D5:.25 G5:.25 B3:.25 D4:.25 G4:.25 D5:.25 G5:.25 G4:.25 D5:.25 G5:.25
           B3:.25 C4:.25 E4:.25 G4:.25 C5:.25 E4:.25 G4:.25 C5:.25 B3:.25 C4:.25 E4:.25 G4:.25 C5:.25 E4:.25 G4:.25 C5:.25`,
    bass: `C3:4 C3:4 B2:4 C3:4 C3:4 C3:4 B2:4 B2:4`,
  },
};

const Chiptune = (() => {
  const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(name) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(name);
    if (!m) throw new Error('bad note ' + name);
    const midi = (Number(m[3]) + 1) * 12 + SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function parse(score) {
    return score.split(/\s+/).filter((t) => t && t !== '|').map((t) => {
      const [n, b] = t.split(':');
      return { f: n === 'R' ? 0 : freq(n), beats: parseFloat(b) };
    });
  }
  const totalBeats = (notes) => notes.reduce((s, n) => s + n.beats, 0);

  let ctx = null;
  let master = null;
  let timer = null;
  let current = null; // { key, tracks, spb }

  function voice(track, f, t, dur) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = track.wave;
    osc.frequency.setValueAtTime(f, t);
    const len = Math.max(0.03, dur * 0.88);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(track.vol, t + 0.01);
    g.gain.setValueAtTime(track.vol, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(g).connect(current.bus);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  // 0.25초 앞까지 미리 예약해 두는 방식이라 화면이 바빠도 박자가 밀리지 않는다
  function tick() {
    if (!current) return;
    const until = ctx.currentTime + 0.25;
    current.tracks.forEach((tr) => {
      while (tr.t < until) {
        const n = tr.notes[tr.i];
        const dur = n.beats * current.spb;
        if (n.f) voice(tr, n.f, tr.t, dur);
        tr.t += dur;
        tr.i = (tr.i + 1) % tr.notes.length;
      }
    });
  }

  function play(key) {
    const song = SONGS[key];
    if (!song) return false;
    stop();
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      if (!master) { master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); }
    } catch (e) { return false; }
    const start = ctx.currentTime + 0.08;
    const bus = ctx.createGain();
    bus.connect(master);
    current = {
      key,
      bus,
      spb: 60 / song.bpm,
      tracks: [
        { notes: parse(song.lead), wave: 'square', vol: 0.05, i: 0, t: start },
        { notes: parse(song.bass), wave: 'triangle', vol: 0.12, i: 0, t: start },
      ],
    };
    tick();
    timer = setInterval(tick, 50);
    return true;
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    // 이미 예약해 둔 음은 이 곡 전용 볼륨을 0으로 내려 바로 끊는다
    if (current) {
      const { bus } = current;
      bus.gain.setValueAtTime(0, ctx.currentTime);
      setTimeout(() => bus.disconnect(), 1000);
    }
    current = null;
  }

  return {
    play,
    stop,
    get playing() { return current ? current.key : null; },
    // 시험용: 곡마다 멜로디와 베이스 길이가 같은지
    check() {
      return Object.entries(SONGS).map(([key, s]) => ({ key, lead: totalBeats(parse(s.lead)), bass: totalBeats(parse(s.bass)) }));
    },
  };
})();
