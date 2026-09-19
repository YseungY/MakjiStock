/* 잠금·구매·예측 판정의 화면 공통 로직 (데모) — 정책 수치는 reward-policy.ts */
import { addDays, breadOf, quoteAt, shortOf } from "./engine";
import {
  REWARD_RATE_PCT,
  codeExpiry,
  couponAmountWon,
  finalCouponPct,
  lockProtection,
  resolveDirection,
  type Session,
} from "./reward-policy";
import type { PriceLock, Prediction, Reward } from "./store";

export type LockPhase = "none" | "holding" | "protecting" | "purchased" | "expired";

/**
 * 잠금 단계 — 하루 잠금권 1개로 오전(1번) 또는 오후(2번) 중 하나만 잠급니다.
 * - 1번 오전 잠금: 잠근 날 오전장 동안 보관, 같은 날 16:00–23:59에 잠금가 구매
 * - 2번 오후 잠금: 잠근 날 오후장 동안 보관, 다음 날 00:00–04:59 정가 시간에도 잠금가 구매
 *   (00:00–04:59는 정가이지만 2번 잠금자만 잠금가로 구매, 05:00–05:59 정가 리셋 시간에는 불가)
 */
export function lockPhaseOf(
  lock: PriceLock | null,
  now: { session: Session; reset: boolean; demo: boolean },
  todayKey: string,
): LockPhase {
  if (!lock) return "none";
  if (lock.status === "purchased") return "purchased";
  const protection = lockProtection(lock.session);
  if (!protection) return "expired";
  const sameDay = todayKey === lock.dateKey;
  if (lock.session === "am") {
    if (!sameDay) return "expired";
    if (now.session === "am") return "holding";
    if (now.session === "pm") return "protecting";
    return "expired";
  }
  /* 2번 오후 잠금 */
  if (sameDay && now.session === "pm") return "holding";
  const nextDawn = todayKey === addDays(lock.dateKey, 1) || (now.demo && sameDay);
  if (nextDawn && now.session === "list" && !now.reset) return "protecting";
  return "expired";
}

/** 예측 대상: 오전장 구매자 → 오늘 16:00 오후가, 그 외 → 다음 06:00 오전가 */
export function targetOf(role: "general" | "buyer", session: Session) {
  if (role === "buyer" && session === "am") return { target: "pm-today" as const, targetLabel: "오늘 16:00 오후가" };
  return { target: "am-next" as const, targetLabel: session === "list" ? "오늘 06:00 오전가" : "내일 06:00 오전가" };
}

/** 데모 판정: 결과 가격을 산식으로 계산하고, 그 시점 판매가 기준 정액 할인코드를 만듭니다. */
export function resolveDemo(p: Prediction, makeCode: (prefix: string) => string) {
  const bread = breadOf(p.tk);
  const resultKey = p.target === "pm-today" || p.submittedSession === "list" ? p.dateKey : addDays(p.dateKey, 1);
  const resultSession: Session = p.target === "pm-today" ? "pm" : "am";
  const resultPrice = quoteAt(bread, resultKey, resultSession).price;
  const outcome = resolveDirection(p.direction, p.ref, resultPrice);
  const ratePct = REWARD_RATE_PCT[p.role][outcome];
  const amount = ratePct ? couponAmountWon(ratePct, resultPrice, bread.base) : 0;
  const reward: Reward = {
    ratePct,
    couponPct: ratePct ? finalCouponPct(ratePct, resultPrice, bread.base) : 0,
    amount,
    code: amount > 0 ? makeCode("BM") : null,
    validLabel: (() => {
      const e = codeExpiry(resultSession);
      return `${shortOf(addDays(resultKey, e.dayOffset))} ${e.time}까지`;
    })(),
    salePrice: resultPrice,
  };
  return { outcome, resultPrice, reward };
}
