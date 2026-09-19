export type AppView = "market" | "me";

export type ProductQuote = {
  id: string;
  ticker: string;
  name: string;
  shortName: string;
  subtitle: string;
  basePriceWon: number;
  todayPriceWon: number;
  /** 16:00 오후장 확정가(데모). 없으면 오전가 유지 */
  afternoonPriceWon?: number;
  /** 다음 날 06:00 오전가(데모 판정용) */
  nextMorningPriceWon?: number;
  previousPriceWon: number;
  searchRatio: number;
  previousSearchRatio: number;
  searchChangePoint: number;
  searchCouponPct: number;
  fxDeclinePct: number;
  fxAdjustmentPct: number;
  totalDiscountPct: number;
  history: number[];
  cafe24ProductNo: number | null;
  cafe24Url: string;
  accent: string;
};

export type MarketSnapshot = {
  asOf: string;
  publishedDate: string;
  fxSourceDate: string;
  nextPublishAt: string;
  makjiIndex: number;
  makjiIndexChangePoint: number;
  topDiscountProductId: string;
  predictionRound: {
    id: string;
    targetPublishDate: string;
    closesAt: string;
  };
  products: ProductQuote[];
};

export type SortMode = "drop" | "price" | "name";

export type PredictionRecord = {
  id: string;
  roundId: string;
  selectedProductId: string;
  submittedAt: string;
  targetPublishDate: string;
  status: "pending" | "hit" | "miss";
  couponStatus?: "none" | "requested" | "sent";
  couponEmail?: string;
};

export type EventLog = {
  id: string;
  event:
    | "page_view"
    | "product_click"
    | "prediction_submit"
    | "coupon_click"
    | "purchase_link_click";
  productId?: string;
  createdAt: string;
  meta?: Record<string, string | number | boolean>;
};
