import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedCouponPct,
  INSTANT_REWARD_PCT,
  PREDICTION_CODE_HOURS,
  PREDICTION_REWARD_MAX_PCT,
  PREDICTION_REWARD_MIN_PCT,
  predictionRewardPct,
  rewardPctFor,
  predictionCodeValidUntil,
  lockOpensOn,
  couponAmountWon,
  effectiveDiscountPct,
  finalCouponPct,
  lockAppliedPriceWon,
  lockCodeAmountWon,
  lockProtection,
  resolveDirection,
  rewardMessage,
  sessionOfHour,
} from "../lib/bread-market/reward-policy.ts";

test("세션: 06–15 오전장, 16–23 오후장, 00–05 정가", () => {
  assert.equal(sessionOfHour(6), "am");
  assert.equal(sessionOfHour(15), "am");
  assert.equal(sessionOfHour(16), "pm");
  assert.equal(sessionOfHour(23), "pm");
  assert.equal(sessionOfHour(0), "pm"); // 오후장은 01:59 까지
  assert.equal(sessionOfHour(1), "pm");
  assert.equal(sessionOfHour(25), "pm"); // 시장 시계의 01시
  assert.equal(sessionOfHour(2), "list");
  assert.equal(sessionOfHour(5), "list");
});

test("허용 쿠폰율 = 38 − D (정가 기준 %p)", () => {
  assert.equal(allowedCouponPct(6500, 10000), 3); // 할인 35% → 쿠폰 3%p 까지
  assert.equal(finalCouponPct(5, 9200, 10000), 5);
  assert.equal(finalCouponPct(5, 6500, 10000), 3);
  assert.equal(finalCouponPct(5, 6200, 10000), 0); // 이미 38%
});

test("정액 코드 금액은 정가 기준 10원 내림이고 실효 할인 38%를 넘지 않는다", () => {
  for (const base of [1500, 3800, 4500, 11000, 21000]) {
    for (let price = Math.round(base * 0.62 / 10) * 10; price <= base * 1.28; price += 10) {
      for (const rate of [5]) {
        const amount = couponAmountWon(rate, price, base);
        assert.equal(amount % 10, 0);
        assert.ok(amount <= base * rate / 100 + 1e-9);
        assert.ok(effectiveDiscountPct(price - amount, base) <= 38 + 1e-9, `${base}/${price}/${rate}`);
      }
    }
  }
  // 정가 기준이라 빵마다 금액이 고정된다
  assert.equal(couponAmountWon(5, 4050, 4500), 220); // 모닝롤
  assert.equal(couponAmountWon(5, 9900, 11000), 550); // 테트리스
  assert.equal(couponAmountWon(5, 1360, 1500), 70); // 머핀
  assert.equal(couponAmountWon(5, 6500, 10000), 300); // 35% 할인 중 → 3%p 만
});

test("예측 판정과 메시지", () => {
  assert.equal(resolveDirection("up", 3000, 3100), "hit");
  assert.equal(resolveDirection("down", 3000, 3100), "miss");
  assert.equal(resolveDirection("up", 3000, 3000), "void");
  assert.equal(rewardMessage("hit").title, "예측 적중!");
  assert.equal(rewardMessage("miss").ratePct, 0);
  assert.equal(rewardMessage("void").ratePct, 5);
  assert.equal(rewardMessage("hit").ratePct, 5);
});

test("예측 코드는 발급 시각부터 24시간", () => {
  assert.equal(PREDICTION_CODE_HOURS, 24);
  assert.equal(
    predictionCodeValidUntil("2026-09-20T05:10:00.000Z"),
    "2026-09-21T05:10:00.000Z",
  );
});

/* 기준이 판정일이 아니라 발급 시각이어야 한다. 밀린 판정을 뒤늦게 따라잡을 때
   이미 지나간 만료 시각이 붙으면 발급 즉시 죽은 코드가 나간다. */
test("밀린 판정을 따라잡아도 만료가 미래다", () => {
  const 발급 = "2026-09-20T05:10:00.000Z"; // 09-18 분을 이틀 늦게 판정
  assert.ok(new Date(predictionCodeValidUntil(발급)) > new Date(발급));
});

test("서머타임·월말이 없어도 24시간은 그냥 24시간", () => {
  assert.equal(predictionCodeValidUntil("2026-09-30T16:00:00.000Z"), "2026-10-01T16:00:00.000Z");
});

test("잠금: 오전장에만, 오후장(~01:59)에 보호, 하락 시 현재가", () => {
  assert.equal(lockProtection("am")?.protectSession, "pm");
  assert.equal(lockProtection("am")?.until, "01:59");
  assert.equal(lockProtection("pm"), null);
  assert.equal(lockProtection("list"), null);
  assert.equal(lockAppliedPriceWon(3000, 3200), 3000);
  assert.equal(lockAppliedPriceWon(3000, 2800), 2800);
  assert.equal(lockCodeAmountWon(3000, 3200), 200);
  assert.equal(lockCodeAmountWon(3000, 2800), 0);
});

/* 주말은 외환시장이 쉬어 오후가가 없다. 보호할 가격 변동이 없으므로 잠금을 받지 않는다. */
test("잠금은 평일에만 열린다", () => {
  assert.equal(lockOpensOn("2026-09-18"), true);  // 금
  assert.equal(lockOpensOn("2026-09-19"), false); // 토
  assert.equal(lockOpensOn("2026-09-20"), false); // 일
  assert.equal(lockOpensOn("2026-09-21"), true);  // 월
});

/* 예측 보상률은 회차마다 3~10% 에서 달라진다. 회차 id 로 결정론적으로 뽑아야
   화면에 보인 값과 저장되는 값이 같고, 10 이 나올 때까지 새로고침할 수 없다. */
test("같은 회차는 언제 물어도 같은 보상률", () => {
  const a = predictionRewardPct("2026-09-21-am");
  assert.equal(predictionRewardPct("2026-09-21-am"), a);
  assert.equal(predictionRewardPct("2026-09-21-am"), a);
});

test("보상률은 3~10% 안이고 회차마다 갈린다", () => {
  const seen = new Set();
  for (let d = 1; d <= 28; d += 1) {
    const pct = predictionRewardPct(`2026-09-${String(d).padStart(2, "0")}-am`);
    assert.ok(pct >= PREDICTION_REWARD_MIN_PCT && pct <= PREDICTION_REWARD_MAX_PCT, `${pct} 가 범위 밖`);
    assert.equal(pct, Math.trunc(pct));
    seen.add(pct);
  }
  assert.ok(seen.size >= 5, `28회차에 ${seen.size}종만 나왔다 — 한쪽으로 쏠린다`);
});

/* 바로 받기가 예측보다 유리해야 "미루지 말고 지금" 이 성립한다.
   예측 기대값 = 평균 보상률 × 적중 확률(실측 52.1%) ≈ 6.5 × 0.52 ≈ 3.4%. */
test("바로 받기는 확정 10% — 예측 기대값보다 확실히 높다", () => {
  assert.equal(INSTANT_REWARD_PCT, 10);
  const 평균 = (PREDICTION_REWARD_MIN_PCT + PREDICTION_REWARD_MAX_PCT) / 2;
  assert.ok(INSTANT_REWARD_PCT > 평균 * 0.521, "바로 받기가 예측 기대값보다 낮으면 미루는 쪽이 이득이다");
});

/* 약속한 보상률은 적중·무승부에만 준다. 빗나가면 0 이다. */
test("판정은 제출 때 약속한 값을 쓴다", () => {
  assert.equal(rewardPctFor("hit", 9), 9);
  assert.equal(rewardPctFor("void", 9), 9);
  assert.equal(rewardPctFor("miss", 9), 0);
});
