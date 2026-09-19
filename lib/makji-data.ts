export type ProductId =
  | "english_muffin"
  | "gluten_free_scone"
  | "morning_roll"
  | "tetris_bread"
  | "gluten_free_financier";

export type Product = {
  id: ProductId;
  ticker: string;
  name: string;
  shortName: string;
  tagline: string;
  basePriceWon: number;
  cafe24ProductNo: number;
  color: string;
  keywords: string[];
};

export type Quote = {
  productId: ProductId;
  priceWon: number;
  previousPriceWon: number;
  priceChangeWon: number;
  priceChangePct: number;
  searchRatio: number;
  searchChangePoint: number;
  searchCouponPct: number;
  fxRawAdjustmentPct: number;
  fxDeclinePct: number;
  fxAdjustmentPct: number;
  discountPct: number;
  fxCurrentDate: string;
  fxPreviousDate: string;
  searchSignalDate: string;
  formulaVersion: string;
  history: number[];
};

export const FORMULA_VERSION =
  "v5-search-absolute-0.10_fx-0.28-scale-50_fx-cap-28_total-cap-38_close-open";

export const PRICING = {
  searchWeight: 0.1,
  fxWeight: 0.28,
  fxScale: 50,
  fxDiscountCapPct: 28,
  fxSurchargeCapPct: 28,
  discountCapPct: 38,
  roundingWon: 10,
};

export const PRODUCTS: Product[] = [
  {
    id: "english_muffin",
    ticker: "MUF",
    name: "막지 잉글리시 머핀",
    shortName: "잉글리시 머핀",
    tagline: "비건 잉글리시 머핀",
    basePriceWon: 1500,
    cafe24ProductNo: 101,
    color: "#7b5b22",
    keywords: [
      "막지잉글리시머핀",
      "막지비건머핀",
      "비건잉글리시머핀",
      "비건머핀",
      "잉글리시머핀",
      "잉글리쉬머핀",
      "영국머핀",
      "햄치즈머핀",
      "햄치즈잉글리시머핀",
    ],
  },
  {
    id: "gluten_free_scone",
    ticker: "SCN",
    name: "막지 글루텐프리 스콘",
    shortName: "글루텐프리 스콘",
    tagline: "버터향 글루텐프리 스콘",
    basePriceWon: 3800,
    cafe24ProductNo: 102,
    color: "#d7a541",
    keywords: [
      "막지스콘",
      "막지글루텐프리스콘",
      "글루텐프리스콘",
      "스콘",
      "버터스콘",
      "단짠스콘",
      "수제스콘",
      "플레인스콘",
      "스콘추천",
      "스콘선물",
    ],
  },
  {
    id: "morning_roll",
    ticker: "MRL",
    name: "막지 제로 모닝롤",
    shortName: "모닝롤",
    tagline: "제로 슈가 모닝롤",
    basePriceWon: 4500,
    cafe24ProductNo: 103,
    color: "#d6a06d",
    keywords: [
      "막지모닝롤",
      "막지제로모닝롤",
      "무설탕모닝롤",
      "제로모닝롤",
      "저당모닝롤",
      "설탕무첨가모닝롤",
      "모닝롤",
      "모닝빵",
      "모닝롤빵",
      "모닝빵추천",
      "막지모닝빵",
      "막지제로모닝빵",
      "무설탕모닝빵",
      "제로모닝빵",
      "저당모닝빵",
      "설탕무첨가모닝빵",
    ],
  },
  {
    id: "tetris_bread",
    ticker: "TTR",
    name: "막지 테트리스 브레드",
    shortName: "테트리스 브레드",
    tagline: "폭신한 통식빵",
    basePriceWon: 11000,
    cafe24ProductNo: 104,
    color: "#c48a54",
    keywords: [
      "막지테트리스브레드",
      "막지테트리스식빵",
      "테트리스브레드",
      "테트리스식빵",
      "통식빵",
      "무첨가식빵",
      "수제식빵",
      "우유식빵",
    ],
  },
  {
    id: "gluten_free_financier",
    ticker: "FNC",
    name: "막지 글루텐프리 휘낭시에",
    shortName: "휘낭시에",
    tagline: "글루텐프리 버터 휘낭시에",
    basePriceWon: 3800,
    cafe24ProductNo: 105,
    color: "#9b5b36",
    keywords: [
      "막지휘낭시에",
      "막지글루텐프리휘낭시에",
      "글루텐프리휘낭시에",
      "피칸휘낭시에",
      "초코휘낭시에",
      "코코넛휘낭시에",
      "버터휘낭시에",
      "휘낭시에",
      "피낭시에",
      "수제휘낭시에",
      "휘낭시에선물",
      "휘낭시에추천",
    ],
  },
];

const signal = {
  previousFxRate: 1348.6,
  currentFxRate: 1341.23,
  fxPreviousDate: "2026-09-14",
  fxCurrentDate: "2026-09-15",
  searchSignalDate: "2026-09-15",
};

const searchRatios: Record<ProductId, number> = {
  english_muffin: 97,
  gluten_free_scone: 70.5,
  morning_roll: 65.8,
  tetris_bread: 54.6,
  gluten_free_financier: 31.6,
};

const previousSearchRatios: Record<ProductId, number> = {
  english_muffin: 89.75,
  gluten_free_scone: 77.85,
  morning_roll: 73.8,
  tetris_bread: 54.33,
  gluten_free_financier: 35.94,
};

const previousPrices: Record<ProductId, number> = {
  english_muffin: 1500,
  gluten_free_scone: 3800,
  morning_roll: 4500,
  tetris_bread: 8830,
  gluten_free_financier: 2520,
};

const histories: Record<ProductId, number[]> = {
  english_muffin: [1410, 1370, 1320, 1280, 1350, 1310, 1240],
  gluten_free_scone: [3710, 3590, 3450, 3350, 3500, 3380, 3240],
  morning_roll: [4280, 4160, 4030, 3920, 4100, 3990, 3860],
  tetris_bread: [8610, 8840, 9120, 8710, 8830, 10290, 9560],
  gluten_free_financier: [2720, 2860, 3110, 3380, 3330, 2520, 3390],
};

export function money(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function roundToWon(value: number, unit = PRICING.roundingWon) {
  return Math.round(value / unit) * unit;
}

export function getFxDeclinePct() {
  return (
    ((signal.previousFxRate - signal.currentFxRate) / signal.previousFxRate) *
    100
  );
}

export function calculateQuote(product: Product): Quote {
  const fxDeclinePct = getFxDeclinePct();
  const searchRatio = searchRatios[product.id];
  const searchChangePoint = searchRatio - previousSearchRatios[product.id];
  const searchCouponPct = searchRatio * PRICING.searchWeight;
  const fxRawAdjustmentPct =
    fxDeclinePct * PRICING.fxWeight * PRICING.fxScale;
  const fxAdjustmentPct = Math.max(
    -PRICING.fxSurchargeCapPct,
    Math.min(PRICING.fxDiscountCapPct, fxRawAdjustmentPct),
  );
  const discountPct = Math.min(
    PRICING.discountCapPct,
    searchCouponPct + fxAdjustmentPct,
  );
  const priceWon = roundToWon(product.basePriceWon * (1 - discountPct / 100));
  const previousPriceWon = previousPrices[product.id];
  const priceChangeWon = priceWon - previousPriceWon;
  const priceChangePct =
    previousPriceWon === 0 ? 0 : (priceWon / previousPriceWon - 1) * 100;

  return {
    productId: product.id,
    priceWon,
    previousPriceWon,
    priceChangeWon,
    priceChangePct,
    searchRatio,
    searchChangePoint,
    searchCouponPct,
    fxRawAdjustmentPct,
    fxDeclinePct,
    fxAdjustmentPct,
    discountPct,
    fxCurrentDate: signal.fxCurrentDate,
    fxPreviousDate: signal.fxPreviousDate,
    searchSignalDate: signal.searchSignalDate,
    formulaVersion: FORMULA_VERSION,
    history: histories[product.id],
  };
}

export function getProduct(productId: string) {
  return PRODUCTS.find((product) => product.id === productId) ?? null;
}

export function getMarketSnapshot() {
  const rows = PRODUCTS.map((product) => ({
    product,
    quote: calculateQuote(product),
  }));
  const topDiscountProductId = rows.reduce((top, row) =>
    row.quote.discountPct > top.quote.discountPct ? row : top,
  ).product.id;
  const averageDiscount =
    rows.reduce((sum, row) => sum + row.quote.discountPct, 0) / rows.length;
  const indexValue = Math.round((100 - averageDiscount) * 100) / 100;

  return {
    asOf: "2026-09-16T09:00:00+09:00",
    publishDate: "2026-09-16",
    marketStatus: "published",
    fxSourceDate: signal.fxCurrentDate,
    index: {
      value: indexValue,
      changePoint: -1.24,
      history: [89.2, 88.6, 86.9, 87.4, 85.8, 86.3, indexValue],
    },
    topDiscountProductId,
    predictionRound: {
      id: "round-2026-09-17",
      targetPublishDate: "2026-09-17",
      closesAt: "2026-09-17T08:50:00+09:00",
    },
    products: rows,
  };
}

export function buildCafe24Url(product: Product) {
  return `https://makjibakery.cafe24.com/product/detail.html?product_no=${product.cafe24ProductNo}`;
}
