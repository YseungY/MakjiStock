/* ══════════════════════════════════════════════════════════
   가격 잠금 · 예측 보상 정책 (PRD v0.6)
   - 세션: 오전장 06:00–15:59 · 오후장 16:00–다음 날 01:59 · 정가 02:00–05:59
   - 잠금: 오전장에만, 하루 1회, 빵 1개 (docs/가격-잠금-1회-사유.md)
   - 보상률: 예측이 틀리지만 않으면 5% (적중·가격 동일 5%, 빗나감 0%)
   - 쿠폰은 Cafe24 할인코드(정액)로 발급하고, 정가 대비 실효 할인 38%를 넘지 않게
     발급 시점 판매가로 min(R, 허용 쿠폰율)을 계산합니다.
   - 할인코드는 다음 가격 하락 가능 시점 전까지만 유효합니다.
   이 파일은 서버·클라이언트·테스트가 함께 쓰는 순수 함수만 둡니다.
   ══════════════════════════════════════════════════════════ */

export const TOTAL_CAP_PCT = 38;

export type Session = "am" | "pm" | "list";
export type Direction = "up" | "down";
export type Outcome = "hit" | "miss" | "void";

export const SESSION_LABEL: Record<Session, string> = {
  am: "오전장",
  pm: "오후장",
  list: "정가",
};

export const SESSION_RANGE: Record<Session, string> = {
  am: "06:00–15:59",
  pm: "16:00–01:59",
  list: "02:00–05:59",
};

/** KST 시로 가격 세션을 판정합니다. 00–01시(또는 시장 시계의 24–25시)는 전날 오후장입니다. */
export function sessionOfHour(hour: number): Session {
  if (hour >= 6 && hour < 16) return "am";
  if (hour >= 16 || hour < 2) return "pm";
  return "list";
}

/* 예측 보상률은 회차마다 달라진다 (3~10%). 즉시 수령은 5% 고정이다.
   "지금 5% 확정" 과 "내일 맞히면 ?%" 중에 고르게 해서, 예측 때문에 구매를
   미루는 것을 줄이고 기업이 밀고 싶은 빵으로 구매를 모으려는 설계다. */

/** 바로 받기 — 예측을 포기하고 그 자리에서 받는 확정 보상률. */
export const INSTANT_REWARD_PCT = 10;

/** 예측 보상률 범위. 이 안에서 회차마다 뽑는다. */
export const PREDICTION_REWARD_MIN_PCT = 3;
export const PREDICTION_REWARD_MAX_PCT = 10;

/* 회차 id 로 결정론적으로 뽑는다. 요청마다 새로 뽑으면 화면에 보인 값과 저장되는
   값이 달라지고, 10 이 나올 때까지 새로고침할 수 있다. 서버와 화면이 같은 함수를
   써서 같은 값을 말한다 — 서버는 제출 시점에 다시 계산해 저장하므로 위조도 막힌다. */
function seedOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 그 회차의 예측 보상률(%). 같은 회차면 누가 언제 물어도 같은 값이다.
 * @param roundId `prediction_rounds.id` — `${시장날짜}-${판정세션}`
 */
export function predictionRewardPct(roundId: string) {
  const span = PREDICTION_REWARD_MAX_PCT - PREDICTION_REWARD_MIN_PCT + 1;
  return PREDICTION_REWARD_MIN_PCT + (seedOf(`reward@${roundId}`) % span);
}

/**
 * 판정 결과에 실제로 줄 보상률. 약속한 값은 적중·무승부에만 주고 빗나가면 0 이다.
 * 약속값은 제출 시점에 prediction_entries.reward_rate_pct 에 저장된다 — 나중에
 * 회차 규칙이 바뀌어도 이미 건 사람의 조건은 그대로다.
 */
export function rewardPctFor(outcome: Outcome, promisedPct: number) {
  return outcome === "miss" ? 0 : promisedPct;
}

/** @deprecated 회차마다 달라진다. rewardPctFor 를 쓸 것. 문구·테스트 호환으로 남긴다. */
export const REWARD_RATE_PCT: Record<Outcome, number> = { hit: 5, miss: 0, void: 5 };

/** 판매가 할인율 D(%) — 10원 반올림 후 실제 판매가로 다시 계산합니다. 정가를 넘지 않아 0 이상. */
export function saleDiscountPct(salePriceWon: number, basePriceWon: number) {
  return (1 - salePriceWon / basePriceWon) * 100;
}

/** 허용 쿠폰율(%p, 정가 기준) = 38 − D. 상품 할인과 쿠폰을 합쳐 정가의 38% 를 넘지 않는다. */
export function allowedCouponPct(salePriceWon: number, basePriceWon: number) {
  return Math.max(0, TOTAL_CAP_PCT - saleDiscountPct(salePriceWon, basePriceWon));
}

/** 최종 쿠폰율(%) = min(R, 허용 쿠폰율), 0.1% 단위 내림 */
export function finalCouponPct(ratePct: number, salePriceWon: number, basePriceWon: number) {
  const pct = Math.min(ratePct, allowedCouponPct(salePriceWon, basePriceWon));
  return Math.max(0, Math.floor(pct * 10 + 1e-9) / 10);
}

/**
 * 정액 할인코드 금액(원) — 정가 × 최종 쿠폰율, 10원 단위 내림.
 * 정가 기준이라 빵마다 금액이 고정된다(모닝롤 5% = 220원). 발급 시점 할인율이 높아
 * 합계가 38% 를 넘으면 그만큼 줄어든다. 결제가가 정가의 62% 아래로 내려가지 않게 한 번 더 보정한다.
 */
export function couponAmountWon(ratePct: number, salePriceWon: number, basePriceWon: number) {
  const pct = finalCouponPct(ratePct, salePriceWon, basePriceWon);
  let amount = Math.floor((basePriceWon * pct) / 100 / 10) * 10;
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

/** 일반 예측 결과 메시지·배지. */
export function rewardMessage(outcome: Outcome) {
  const rate = REWARD_RATE_PCT[outcome];
  if (outcome === "void") return { badge: "무승부", title: "가격이 같아 무승부예요", ratePct: rate };
  if (outcome === "hit") return { badge: "적중", title: "예측 적중!", ratePct: rate };
  return { badge: "미적중", title: "아쉽게 빗나갔어요", ratePct: rate };
}

/** 예측 할인코드 유효 기간 — 발급 시점부터 24시간. */
export const PREDICTION_CODE_HOURS = 24;

/**
 * 예측 할인코드 유효 종료 — 발급 시각 + 24시간.
 *
 * 기준이 판정한 시장일이 아니라 발급 시각이다. 그래서 크론이 밀렸다가 뒤늦게
 * 따라잡아도 이미 지나간 만료 시각이 붙지 않는다 (resolvePredictions 는 지난
 * 날짜의 pending 도 판정한다).
 *
 * 잠금 쿠폰은 이 함수를 쓰지 않는다 — 보호 구간(16:00~다음 날 01:59)이 곧
 * 유효 기간이라 lock_price_locks 의 protect_from/protect_until 을 그대로 쓴다.
 * 오후 할인율이 올라 합계가 38% 를 살짝 넘는 드문 경우(3개월 기준 1.5% 미만)는 받아들인다.
 */
export function predictionCodeValidUntil(issuedAtIso: string) {
  return new Date(new Date(issuedAtIso).getTime() + PREDICTION_CODE_HOURS * 3_600_000).toISOString();
}

/* ───────── 가격 잠금 ───────── */

/**
 * 잠금 보호 구간 — 잠금은 오전장에만 받습니다.
 * 오전가로 고정하고, 오후장(16:00–다음 날 01:59)에 오후가가 더 높으면 차액 쿠폰으로 잠금가를 맞춥니다.
 * 오후장·정가 시간에는 잠금을 받지 않습니다 — 다음에 올 가격이 정가로 정해져 있어 보호할 불확실성이 없습니다.
 */
export function lockProtection(lockSession: Session) {
  if (lockSession === "am") return { protectSession: "pm" as Session, label: "오늘 16:00–새벽 01:59", until: "01:59" };
  return null;
}

/**
 * 잠금을 받는 날인가 — 주말에는 받지 않습니다.
 *
 * 주말은 외환시장이 쉬어 당일 시가가 없습니다. 그래서 오후가 크론이 오후가를
 * 만들지 않고(daily-pricing 의 fx_unavailable 보류), 오후가가 없으면 잠금가와
 * 비교할 값도 차액 쿠폰도 없습니다. 실데이터 3개월에서 주말 잠금 156건의 보상은
 * 예외 없이 0건이었습니다 — 하루 한 번뿐인 잠금을 확정적으로 버리게 됩니다.
 *
 * 공휴일도 같은 이유로 오후가가 없지만, 휴장일 달력이 없어 여기서는 가리지 못합니다.
 */
export function lockOpensOn(dateKey: string) {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6;
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
  `바로 받으면 ${INSTANT_REWARD_PCT}% 할인코드를 드려요. 내일 예측은 틀리지만 않으면 ` +
  `${PREDICTION_REWARD_MIN_PCT}~${PREDICTION_REWARD_MAX_PCT}% 이고 회차마다 달라져요. ` +
  "상품 할인과 합쳐 최종 혜택은 최대 38%입니다.";
