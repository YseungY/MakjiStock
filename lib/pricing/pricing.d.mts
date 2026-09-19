export type PricingConfig = {
  searchWeight: number;
  fxWeight: number;
  fxScale: number;
  fxDiscountCapPct: number;
  fxSurchargeCapPct: number;
  discountCapPct: number;
  /** 없으면 하한 없음. v0.7 은 -10 (할증 10% 제한) */
  discountFloorPct?: number;
  priceRoundingWon: number;
};

export type FxSignal = {
  reference: "PREVIOUS_CLOSE_TO_CLOSE" | "PREVIOUS_CLOSE_TO_TODAY_OPEN";
  previousDate: string;
  previousRate: number;
  currentDate: string;
  currentRate: number;
  declinePct: number;
  carriedForward: boolean;
};

export type DayCalculation = {
  searchCouponPct: number;
  fxRawAdjustmentPct: number;
  fxAdjustmentPct: number;
  rawDiscountPct: number;
  discountPct: number;
  priceWon: number;
};

export function roundTo(value: number, unit: number): number;
export function buildSessionFxSignals(options: {
  closesByDate: Record<string, number>;
  opensByDate: Record<string, number>;
  publishDates: string[];
}): Record<string, { morning: FxSignal | null; afternoon: FxSignal | null }>;
export function calculateDay(options: {
  searchRatio: number;
  fxDeclinePct: number;
  basePriceWon: number;
  pricing: PricingConfig;
}): DayCalculation;
