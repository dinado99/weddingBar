// 픽셀 술병 스프라이트. 이미지 파일 없이 문자 격자로 그린다.
// 문자 뜻: . 투명 / o 외곽선 / b 몸통 / l 몸통 밝은 면 / d 몸통 어두운 면
//          c 뚜껑·포일 / w 라벨 바탕 / r 라벨 무늬 / g 유리
const DRINKS = {
  soju: {
    name: '소주', color: '#3fa66b', cap: '#2e7d4f', accent: '#2e7d4f', ribbonRow: 4,
    rows: [
      '...oooo...',
      '...occo...',
      '...occo...',
      '...obbo...',
      '...olbo...',
      '...olbo...',
      '..olbbdo..',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.owwwwwwo.',
      '.owrrrrwo.',
      '.owwwwwwo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '..oooooo..',
    ],
  },
  beer: {
    name: '맥주', color: '#8a4b1f', cap: '#e0b23a', accent: '#c0392b', ribbonRow: 5,
    rows: [
      '...oooo...',
      '...occo...',
      '...obbo...',
      '...olbo...',
      '...owwo...',
      '...olbo...',
      '..olbbdo..',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.owwwwwwo.',
      '.owrrrrwo.',
      '.owrrrrwo.',
      '.owwwwwwo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '..oooooo..',
    ],
  },
  makgeolli: {
    name: '막걸리', color: '#efeadc', cap: '#3a8f5c', accent: '#3a8f5c', ribbonRow: 4,
    rows: [
      '..oooooo..',
      '..occcco..',
      '..occcco..',
      '..oooooo..',
      '..olbbdo..',
      '.olbbbbdo.',
      'olbbbbbbdo',
      'olbbbbbbdo',
      'owwwwwwwwo',
      'owrrrrrrwo',
      'owrrrrrrwo',
      'owwwwwwwwo',
      'olbbbbbbdo',
      'olbbbbbbdo',
      'olbbbbbbdo',
      'olbbbbbbdo',
      '.oooooooo.',
    ],
  },
  wine: {
    name: '와인', color: '#6b1430', cap: '#9b1d3a', accent: '#6b1430', ribbonRow: 7,
    rows: [
      '...oooo...',
      '...occo...',
      '...occo...',
      '...occo...',
      '...occo...',
      '...obbo...',
      '...olbo...',
      '...olbo...',
      '...olbo...',
      '..olbbdo..',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.owwwwwwo.',
      '.owrrrrwo.',
      '.owwwwwwo.',
      '.owwwwwwo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '..oooooo..',
    ],
  },
  champagne: {
    name: '샴페인', color: '#24452f', cap: '#e0b23a', accent: '#e0b23a', ribbonRow: 6,
    rows: [
      '...oooo...',
      '...occo...',
      '...occo...',
      '..occcco..',
      '...occo...',
      '...occo...',
      '...olbo...',
      '..olbbdo..',
      '..olbbdo..',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.owwwwwwo.',
      '.owrrrrwo.',
      '.owwwwwwo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '.olbbbbdo.',
      '..oooooo..',
    ],
  },
  whisky: {
    name: '위스키', color: '#c47a1c', cap: '#2a1a10', accent: '#2a1a10', ribbonRow: 4,
    rows: [
      '...oooo...',
      '...occo...',
      '...occo...',
      '...oooo...',
      '...olbo...',
      'oooooooooo',
      'olbbbbbbdo',
      'olbbbbbbdo',
      'olbwwwwbdo',
      'olbwrrwbdo',
      'olbwrrwbdo',
      'olbwwwwbdo',
      'olbbbbbbdo',
      'olbbbbbbdo',
      'olbbbbbbdo',
      'oooooooooo',
    ],
  },
  sake: {
    name: '사케', color: '#e8eef4', cap: '#e8eef4', accent: '#3b5fa8', ribbonRow: 3,
    rows: [
      '...oooo...',
      '..obbbbo..',
      '...olbo...',
      '...olbo...',
      '...olbo...',
      '..olbbdo..',
      '.olbbbbdo.',
      'olbbbbbbdo',
      'olrrrrrrdo',
      'olbbbbbbdo',
      'olbbbbbbdo',
      '.olbbbbdo.',
      '..oooooo..',
    ],
  },
  cocktail: {
    name: '칵테일', color: '#e86a92', cap: '#e86a92', accent: '#6aa84f', ribbonRow: 5,
    rows: [
      'g........g',
      'glbbbbbbdg',
      '.glbbbbdg.',
      '..glbrdg..',
      '...glgg...',
      '....gg....',
      '....gg....',
      '....gg....',
      '....gg....',
      '..gggggg..',
    ],
  },
};

const SPRITE_W = 10;
const OUTLINE = '#2b1d14';
const LABEL = '#f4ead2';
const GLASS = '#cfe8f0';
const RIBBON = '#ff7aa8';
const WAX = '#a8202a';

const RIBBON_ROWS = ['pp.pp', 'ppppp', '.p.p.'];

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => {
    const target = amount < 0 ? 0 : 255;
    return Math.round(c + (target - c) * Math.abs(amount));
  };
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// 병 하나를 (x, y)에 그린다. y는 병 바닥 기준이다.
function drawBottle(ctx, drinkKey, opts = {}) {
  const drink = DRINKS[drinkKey] || DRINKS.soju;
  const body = opts.color || drink.color;
  const s = opts.scale || 1;
  const x0 = opts.x || 0;
  const top = (opts.y || 0) - drink.rows.length * s;
  const palette = {
    o: OUTLINE,
    b: body,
    l: shade(body, 0.35),
    d: shade(body, -0.3),
    c: opts.sealed ? WAX : drink.cap,
    w: LABEL,
    r: drink.accent,
    g: GLASS,
  };
  drink.rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const color = palette[row[rx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x0 + rx * s, top + ry * s, s, s);
    }
  });
  if (opts.sealed) {
    // 밀랍이 흘러내린 자국
    ctx.fillStyle = WAX;
    ctx.fillRect(x0 + 6 * s, top + 3 * s, s, 2 * s);
  }
  if (opts.ribbon) {
    ctx.fillStyle = RIBBON;
    RIBBON_ROWS.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === 'p') ctx.fillRect(x0 + (2 + rx) * s, top + (drink.ribbonRow + ry) * s, s, s);
      }
    });
  }
}

function bottleHeight(drinkKey) {
  return (DRINKS[drinkKey] || DRINKS.soju).rows.length;
}
