/* ══════════════════════════════════════════════════════════
   Bread Market 가격 엔진 (데모)
   원본: 프로토타입_1차_3팀.html 의 quote / series / indexOf_ 를 그대로 옮겼습니다.
   가격 산식:
     검색쿠폰 = 검색지수 × 0.10
     환율조정 = clamp(환율하락률 × 0.28 × 50, −28, +28)
     할인율 = min(38, 검색쿠폰 + 환율조정)
     오늘가격 = 정가 × (1 − 할인율 ÷ 100), 10원 단위 반올림
   ※ 환율·검색지수는 시드 난수로 만든 데모 값입니다. 실서비스에서는
     이 모듈의 fxDropOf / searchIndexOf 를 실제 API 값으로 교체합니다.
   날짜는 모두 'YYYY-MM-DD' 문자열(KST 기준)로 다룹니다.
   ══════════════════════════════════════════════════════════ */

export type Ticker = "MUF" | "FNC" | "SCN" | "MRL" | "TTR" | "GFD";

export type Bread = {
  tk: Ticker;
  name: string;
  full: string;
  base: number;
  emoji: string;
  photo: string;
};

/* makji.kr 판매중 6종. config/pricing-products.json · Supabase products 와 같은 구성이다. */
export const BREADS: Bread[] = [
  { tk: "MUF", name: "비건 잉글리시 머핀", full: "막지 비건 잉글리시 머핀(햄치즈/비건)", base: 1500, emoji: "🥪", photo: "/images/bread-market/muf-large.jpg" },
  { tk: "FNC", name: "휘낭시에", full: "겉바속쫀 막지 글루텐프리 휘낭시에", base: 3800, emoji: "🧈", photo: "/images/bread-market/fnc-large.jpg" },
  { tk: "SCN", name: "글루텐프리 스콘", full: "환상의 단짠 조합, 막지 글루텐프리 스콘", base: 3800, emoji: "🍪", photo: "/images/bread-market/scn-large.jpg" },
  { tk: "MRL", name: "모닝롤", full: "담백폭신 막지 제로 무설탕 모닝롤", base: 4500, emoji: "🍞", photo: "/images/bread-market/mrl-large.jpg" },
  { tk: "TTR", name: "테트리스 브레드", full: "폭신한 통식빵, 막지 테트리스 브레드", base: 11000, emoji: "🧩", photo: "/images/bread-market/ttr-large.jpg" },
  { tk: "GFD", name: "냉동생지 3종", full: "집에서 굽는 막지 글루텐프리 냉동생지 3종", base: 21000, emoji: "🧊", photo: "/images/bread-market/gfd-large.png" },
];

export const SHOP_URL = "https://makji.kr";

export const CAP_TOTAL = 38;
export const CAP_SURCHARGE = 28;
export const SEARCH_MOMENTUM_WEIGHT = 0.1;
export const FX_MOMENTUM_WEIGHT = 0.28;
export const FX_SCALE = 50;
/** 정가 대비 최대 하락가 비율 */
export const FLOOR = 1 - CAP_TOTAL / 100;

export function breadOf(tk: string): Bread {
  return BREADS.find((b) => b.tk === tk) ?? BREADS[0];
}

/* ───────── 수치 유틸 ───────── */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** -1 ~ 1, 중앙 집중 */
function bell(r: () => number) {
  return (r() + r() + r()) / 1.5 - 1;
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function won(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

export function fixed(n: number, d = 1) {
  return n.toFixed(d);
}

export function signed(n: number, d = 1) {
  const v = fixed(Math.abs(n), d);
  return (n > 0 ? "+" : n < 0 ? "−" : "") + v;
}

export type Dir = "down" | "up" | "flat";

export function cls(v: number): Dir {
  return v < -0.049 ? "down" : v > 0.049 ? "up" : "flat";
}

export function arrow(v: number) {
  return v < -0.049 ? "▼" : v > 0.049 ? "▲" : "—";
}

/* 할인이 0일 때 '−0.0%p' 로 보이지 않게 (환율 상승일에 자주 발생) */
export function discTxt(v: number) {
  if (Math.abs(v) < 0.05) return "0.0%p";
  return v > 0 ? `−${fixed(v)}%p` : `+${fixed(Math.abs(v))}%p`;
}

export function discCls(v: number): Dir {
  return Math.abs(v) < 0.05 ? "flat" : v > 0 ? "down" : "up";
}

function fxWord(drop: number) {
  return drop > 0.0005 ? "하락" : drop < -0.0005 ? "상승" : "보합";
}

export function fxLabel(drop: number) {
  return `${fixed(Math.abs(drop), 3)}% ${fxWord(drop)}`;
}

/** 받침 유무에 따른 조사 선택 */
export function josa(w: string, a: string, b: string) {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return a;
  return (c - 0xac00) % 28 ? a : b;
}

/* ───────── 날짜 (KST 기준 'YYYY-MM-DD') ───────── */
const DAY = 86400000;
const KST = 9 * 3600000;

function msOf(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function keyOfMs(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function kstTodayKey() {
  return keyOfMs(Date.now() + KST);
}

export function addDays(key: string, n: number) {
  return keyOfMs(msOf(key) + n * DAY);
}

function dowOf(key: string) {
  return new Date(msOf(key)).getUTCDay();
}

export function labelOf(key: string) {
  const [y, m, d] = key.split("-");
  return `${y}.${m}.${d} (${"일월화수목금토"[dowOf(key)]})`;
}

export function shortOf(key: string) {
  const [, m, d] = key.split("-");
  return `${m}.${d}`;
}

export function ymdOf(key: string) {
  return key.replaceAll("-", ".");
}

/* ── 시연일 시드 ──
   표시 날짜는 실제 달력 그대로 두고 난수 시드만 일정하게 이동시킵니다.
   ※ 실서비스에서는 SEED_SHIFT = 0 으로 두고 실제 API 값을 씁니다. */
const SEED_SHIFT = 479;

function seedKey(key: string) {
  return SEED_SHIFT ? addDays(key, SEED_SHIFT) : key;
}

/* 외환시장 비영업일(토·일)은 직전 영업일 하락률을 이월 */
function fxSourceKey(key: string) {
  const g = dowOf(key);
  if (g === 0) return { key: addDays(key, -2), carried: true };
  if (g === 6) return { key: addDays(key, -1), carried: true };
  return { key, carried: false };
}

export function fxDropOf(key: string) {
  const src = fxSourceKey(key);
  const r = rng(hash(`fx@${seedKey(src.key)}`));
  /* 원본은 브라우저 로컬(KST) 자정의 epoch 일수를 썼으므로 같은 값이 나오도록 KST 오프셋을 뺍니다.
     느린 파동 두 개 + 약한 잡음 → 백테스트의 자기상관(하루 평균 변동 ≈217원/4,500원)을 흉내냅니다. */
  const t = Math.floor((msOf(seedKey(src.key)) - KST) / DAY);
  const slow = Math.sin(t / 13.7 + 2.1) * 0.6 + Math.sin(t / 29.3 + 0.8) * 0.4;
  return { drop: clamp(slow * 1.28 + bell(r) * 0.46, -2.6, 2.6), carried: src.carried, at: src.key };
}

export function searchIndexOf(bread: Bread, key: string) {
  const r = rng(hash(`search@${bread.tk}@${seedKey(key)}`));
  const a = r();
  return clamp(30 + a * 70 + bell(r) * 10, 0, 100);
}

export type Quote = {
  fxDrop: number;
  fxCarried: boolean;
  fxAt: string;
  fxDisc: number;
  searchIdx: number;
  searchChange: number;
  searchDisc: number;
  total: number;
  price: number;
  vsBase: number;
};

export function quote(bread: Bread, key: string): Quote {
  return quoteWith(bread, key, fxDropOf(key));
}

function quoteWith(bread: Bread, key: string, fx: { drop: number; carried: boolean; at: string }): Quote {
  const fxDisc = clamp(
    fx.drop * FX_MOMENTUM_WEIGHT * FX_SCALE,
    -CAP_SURCHARGE,
    CAP_SURCHARGE,
  );
  const searchIdx = searchIndexOf(bread, key);
  const previousSearchIdx = searchIndexOf(bread, addDays(key, -1));
  const searchChange = searchIdx - previousSearchIdx;
  const searchDisc = searchIdx * SEARCH_MOMENTUM_WEIGHT;
  const total = Math.min(CAP_TOTAL, fxDisc + searchDisc);
  const price = Math.round((bread.base * (1 - total / 100)) / 10) * 10;
  return {
    fxDrop: fx.drop,
    fxCarried: fx.carried,
    fxAt: fx.at,
    fxDisc,
    searchIdx,
    searchChange,
    searchDisc,
    total,
    price,
    vsBase: ((price - bread.base) / bread.base) * 100,
  };
}

/* ───────── 가격 세션 (PRD v0.6) ─────────
   오전장 06:00 = D-1 이하 최근 두 종가 비교(quote)
   오후장 16:00 = D 당일 시가 vs 직전 종가 → 데모에서는 오전 하락률에 별도 시드 잡음을 더합니다.
                  주말·휴일은 당일 시가가 없어 오전가를 유지합니다.
   정가 00:00–05:59 = 기준가 */
export type PriceSession = "am" | "pm" | "list";

export function fxDropPmOf(key: string) {
  const am = fxDropOf(key);
  if (am.carried) return am;
  const r = rng(hash(`fxpm@${seedKey(key)}`));
  return { drop: clamp(am.drop + bell(r) * 0.55, -2.6, 2.6), carried: false, at: key };
}

export function quoteAt(bread: Bread, key: string, session: PriceSession): Quote {
  if (session === "am") return quote(bread, key);
  if (session === "pm") return quoteWith(bread, key, fxDropPmOf(key));
  const fx = fxDropOf(key);
  return {
    fxDrop: 0, fxCarried: fx.carried, fxAt: fx.at, fxDisc: 0,
    searchIdx: searchIndexOf(bread, key), searchChange: 0, searchDisc: 0,
    total: 0, price: bread.base, vsBase: 0,
  };
}

/** 직전 확정가: 오전장 ← 전날 오후가, 오후장 ← 오늘 오전가, 정가 시간 ← 오늘 오후가 */
export function previousQuoteAt(bread: Bread, key: string, session: PriceSession): Quote {
  if (session === "am") return quoteAt(bread, addDays(key, -1), "pm");
  if (session === "pm") return quoteAt(bread, key, "am");
  return quoteAt(bread, key, "pm");
}

export function changeAt(bread: Bread, key: string, session: PriceSession) {
  const current = quoteAt(bread, key, session);
  const previous = previousQuoteAt(bread, key, session);
  const amount = current.price - previous.price;
  return { previousPrice: previous.price, amount, pct: previous.price ? (amount / previous.price) * 100 : 0 };
}

export function makjiIndexAt(key: string, session: PriceSession) {
  let s = 0;
  for (const b of BREADS) s += quoteAt(b, key, session).price / b.base;
  return (s / BREADS.length) * 100;
}

export function topDropAt(key: string, session: PriceSession) {
  return BREADS.map((b) => ({ b, q: quoteAt(b, key, session) })).sort((x, y) => x.q.vsBase - y.q.vsBase)[0];
}

/** 상품 행·티커의 등락은 정가가 아니라 직전 확정가와 비교합니다. */
export function dayChangeOf(bread: Bread, key: string) {
  const current = quote(bread, key);
  const previous = quote(bread, addDays(key, -1));
  const amount = current.price - previous.price;
  return {
    previousPrice: previous.price,
    amount,
    pct: previous.price ? (amount / previous.price) * 100 : 0,
  };
}

/** 오늘(todayKey)에서 off 일 떨어진 날까지 len 일치 시계열 (오래된 순) */
export function series(bread: Bread, todayKey: string, off: number, len: number) {
  const out: { key: string; q: Quote }[] = [];
  for (let i = len - 1; i >= 0; i--) {
    const key = addDays(todayKey, off - i);
    out.push({ key, q: quote(bread, key) });
  }
  return out;
}

/** 막지지수: 정가 100 기준 5종 평균 가격 수준 */
export function makjiIndexOf(key: string) {
  let s = 0;
  for (const b of BREADS) s += quote(b, key).price / b.base;
  return (s / BREADS.length) * 100;
}

/** 오늘 정가 대비 가장 많이 내린 상품 */
export function topDropOf(key: string) {
  return BREADS.map((b) => ({ b, q: quote(b, key) })).sort((x, y) => x.q.vsBase - y.q.vsBase)[0];
}

/** 오늘의 예측 종목 (하루 한 종) */
export function predictBreadOf(key: string) {
  const r = rng(hash(`pick@${key}`));
  return BREADS[Math.floor(r() * BREADS.length)];
}

/** 오늘 참여자 '오른다' 비율 (데모) */
export function upTallyOf(key: string) {
  return Math.round(30 + rng(hash(`tally@${key}`))() * 40);
}

/* ───────── 그래프 ───────── */
export function linePath(vals: number[], w: number, h: number, pad = 3) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const n = vals.length - 1 || 1;
  let d = "";
  vals.forEach((v, i) => {
    const x = pad + (i * (w - pad * 2)) / n;
    const y = h - pad - ((v - lo) / span) * (h - pad * 2);
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
  });
  return {
    d: d.trim(),
    lo,
    hi,
    lx: pad + ((vals.length - 1) * (w - pad * 2)) / n,
    ly: h - pad - ((vals[vals.length - 1] - lo) / span) * (h - pad * 2),
  };
}

export function dirColor(c: Dir) {
  return c === "down" ? "#2F6FBF" : c === "up" ? "#C4574B" : "#9DA3B0";
}
