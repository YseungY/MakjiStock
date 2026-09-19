/* ══════════════════════════════════════════════════════════
   가격 잠금 · 예측 보상 정책 (PRD v0.6)
   - 세션: 오전장 06:00–15:59 · 오후장 16:00–23:59 · 정가 00:00–05:59 (05시대는 정가 리셋)
   - 보상률: 일반 적중 3% / 구매자 적중 7% · 미적중 3% / 가격 동일 시 무효·모두 3%
   - 쿠폰은 Cafe24 할인코드(정액)로 발급하고, 정가 대비 실효 할인 38%를 넘지 않게
     발급 시점 판매가로 min(R, 허용 쿠폰율)을 계산합니다.
   - 할인코드는 다음 가격 하락 가능 시점 전까지만 유효합니다.
   이 파일은 서버·클라이언트·테스트가 함께 쓰는 순수 함수만 둡니다.
   ══════════════════════════════════════════════════════════ */

export const TOTAL_CAP_PCT = 38;

export type Session = "am" | "pm" | "list";
export type Role = "general" | "buyer";
export type Direction = "up" | "down";
export type Outcome = "hit" | "miss" | "void";

export const SESSION_LABEL: Record<Session, string> = {
  am: "오전장",
  pm: "오후장",
  list: "정가",
};

export const SESSION_RANGE: Record<Session, string> = {
  am: "06:00–15:59",
  pm: "16:00–23:59",
  list: "00:00–05:59",
};

/** KST 시(0–23)로 가격 세션을 판정합니다. */
export function sessionOfHour(hour: number): Session {
  if (hour >= 6 && hour < 16) return "am";
  if (hour >= 16) return "pm";
  return "list";
}

/** 05:00–05:59 정가 리셋 시간: 잠금가 구매도 받지 않습니다. */
export function isResetHour(hour: number) {
  return hour === 5;
}

export const REWARD_RATE_PCT: Record<Role, Record<Outcome, number>> = {
  general: { hit: 3, miss: 0, void: 3 },
  buyer: { hit: 7, miss: 3, void: 3 },
};

/** 판매가 할인율 D(%) — 10원 반올림 후 실제 판매가로 다시 계산합니다. 할증이면 음수. */
export function saleDiscountPct(salePriceWon: number, basePriceWon: number) {
  return (1 - salePriceWon / basePriceWon) * 100;
}

/** 허용 쿠폰율(%) = (38 − D) / (100 − D) × 100, 판매가 기준 */
export function allowedCouponPct(salePriceWon: number, basePriceWon: number) {
  const d = saleDiscountPct(salePriceWon, basePriceWon);
  if (d >= TOTAL_CAP_PCT) return 0;
  return ((TOTAL_CAP_PCT - d) / (100 - d)) * 100;
}

/** 최종 쿠폰율(%) = min(R, 허용 쿠폰율), 0.1% 단위 내림 */
export function finalCouponPct(ratePct: number, salePriceWon: number, basePriceWon: number) {
  const pct = Math.min(ratePct, allowedCouponPct(salePriceWon, basePriceWon));
  return Math.max(0, Math.floor(pct * 10 + 1e-9) / 10);
}

/**
 * 정액 할인코드 금액(원) — 발급 시점 판매가 × 최종 쿠폰율, 10원 단위 내림.
 * 반올림 오차가 있어도 결제가가 정가의 62% 아래로 내려가지 않게 한 번 더 보정합니다.
 */
export function couponAmountWon(ratePct: number, salePriceWon: number, basePriceWon: number) {
  const pct = finalCouponPct(ratePct, salePriceWon, basePriceWon);
  let amount = Math.floor((salePriceWon * pct) / 100 / 10) * 10;
  const floorPrice = basePriceWon * (1 - TOTAL_CAP_PCT / 100);
  while (amount > 0 && salePriceWon - amount < floorPrice) amount -= 10;
  return Math.max(0, amount);
}

export function effectiveDiscountPct(payWon: number, basePriceWon: number) {
  return (1 - payWon / basePriceWon) * 100;
}

/** 예측 판정: 기준가와 결과가가 같으면 무효 */
export function resolveDirection(direction: Direction, referencePriceWon: number, resultPriceWon: number): Outcome {
  if (resultPriceWon === referencePriceWon) return "void";
  const rose = resultPriceWon > referencePriceWon;
  return (direction === "up") === rose ? "hit" : "miss";
}

/** 결과 메시지·배지. 구매자의 저점 매수 여부는 금액이 아니라 메시지로만 보여줍니다. */
export function rewardMessage(role: Role, outcome: Outcome, referencePriceWon: number, resultPriceWon: number) {
  const rate = REWARD_RATE_PCT[role][outcome];
  if (outcome === "void") return { badge: "예측 무효", title: "가격이 같아 예측은 무효예요", ratePct: rate };
  if (role === "buyer") {
    if (outcome === "miss") return { badge: "구매자 혜택", title: "예측은 아쉽지만 구매자 혜택", ratePct: rate };
    if (resultPriceWon > referencePriceWon) return { badge: "저점 매수", title: "저점 매수 성공!", ratePct: rate };
    return { badge: "예측 성공", title: "예측 성공! 더 싸게 재구매하세요", ratePct: rate };
  }
  if (outcome === "hit") return { badge: "적중", title: "예측 적중!", ratePct: rate };
  return { badge: "미적중", title: "아쉽게 빗나갔어요", ratePct: rate };
}

/**
 * 할인코드 유효 종료 시각(KST 시·일 오프셋).
 * 쿠폰율은 발급 시점 판매가로 정했으므로, 판매가가 내려갈 수 있는 다음 공개 시각 전까지만 유효합니다.
 * - 오전장 발급 → 당일 15:59 (16:00 오후가는 내려갈 수 있음)
 * - 오후장 발급 → 다음 날 05:59 (00:00 정가 복귀는 가격 상승이라 안전, 06:00 오전가 전 종료)
 * - 정가 시간 발급 → 당일 05:59
 */
export function codeExpiry(issuedSession: Session) {
  if (issuedSession === "am") return { dayOffset: 0, time: "15:59", label: "오늘 15:59까지" };
  if (issuedSession === "pm") return { dayOffset: 1, time: "05:59", label: "내일 05:59까지" };
  return { dayOffset: 0, time: "05:59", label: "오늘 05:59까지" };
}

/* ───────── 가격 잠금 ───────── */

/**
 * 잠금 보호 구간
 * - 오전장(06–15:59) 잠금 → 오전가로 고정, 16:00–23:59 오후장에 잠금가로 구매
 * - 오후장(16–23:59) 잠금 → 오후가로 고정, 다음 날 00:00–04:59 정가 시간에 잠금가로 구매
 * - 정가 시간(00–05:59)에는 잠금을 받지 않습니다.
 */
export function lockProtection(lockSession: Session) {
  if (lockSession === "am") return { protectSession: "pm" as Session, label: "오늘 16:00–23:59", until: "23:59" };
  if (lockSession === "pm") return { protectSession: "list" as Session, label: "내일 00:00–04:59", until: "04:59" };
  return null;
}

/** 잠금 적용가: 손해 보지 않도록 잠금가와 현재가 중 낮은 값 */
export function lockAppliedPriceWon(lockedPriceWon: number, currentPriceWon: number) {
  return Math.min(lockedPriceWon, currentPriceWon);
}

/** 잠금가 할인코드 금액: 현재가가 잠금가보다 높을 때만 차액. 낮으면 더 싼 현재가로 구매(코드 없음). */
export function lockCodeAmountWon(lockedPriceWon: number, currentPriceWon: number) {
  return Math.max(0, currentPriceWon - lockedPriceWon);
}

export const CONSUMER_REWARD_NOTICE =
  "일반 적중 최대 3%, 구매자 적중 최대 7%, 구매자는 틀려도 최대 3% 쿠폰을 드려요. 상품 할인과 합쳐 최종 혜택은 최대 38%입니다.";
