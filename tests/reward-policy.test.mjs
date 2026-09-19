import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedCouponPct,
  codeExpiry,
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
  assert.equal(sessionOfHour(0), "list");
  assert.equal(sessionOfHour(5), "list");
});

test("허용 쿠폰율 = (38-D)/(100-D)", () => {
  assert.equal(allowedCouponPct(6500, 10000).toFixed(2), "4.62");
  assert.equal(finalCouponPct(7, 9200, 10000), 7);
  assert.equal(finalCouponPct(7, 6500, 10000), 4.6);
  assert.equal(finalCouponPct(3, 6331, 10000), 2);
  assert.equal(finalCouponPct(7, 10500, 10000), 7);
});

test("정액 코드 금액은 10원 내림이고 실효 할인 38%를 넘지 않는다", () => {
  for (const base of [1500, 3800, 4500, 11000, 21000]) {
    for (let price = Math.round(base * 0.62 / 10) * 10; price <= base * 1.28; price += 10) {
      for (const rate of [3, 7]) {
        const amount = couponAmountWon(rate, price, base);
        assert.equal(amount % 10, 0);
        assert.ok(amount <= price * rate / 100 + 1e-9);
        assert.ok(effectiveDiscountPct(price - amount, base) <= 38 + 1e-9, `${base}/${price}/${rate}`);
      }
    }
  }
  assert.equal(couponAmountWon(7, 9200, 10000), 640);
  assert.equal(couponAmountWon(7, 6500, 10000), 290);
});

test("예측 판정과 메시지", () => {
  assert.equal(resolveDirection("up", 3000, 3100), "hit");
  assert.equal(resolveDirection("down", 3000, 3100), "miss");
  assert.equal(resolveDirection("up", 3000, 3000), "void");
  assert.equal(rewardMessage("buyer", "hit", 3000, 3100).title, "저점 매수 성공!");
  assert.equal(rewardMessage("buyer", "hit", 3000, 2900).title, "예측 성공! 더 싸게 재구매하세요");
  assert.equal(rewardMessage("buyer", "miss", 3000, 3100).ratePct, 3);
  assert.equal(rewardMessage("general", "miss", 3000, 3100).ratePct, 0);
  assert.equal(rewardMessage("general", "void", 3000, 3000).ratePct, 3);
});

test("코드 유효기간은 다음 하락 가능 시점 전까지", () => {
  assert.equal(codeExpiry("am").label, "오늘 15:59까지");
  assert.equal(codeExpiry("pm").label, "내일 05:59까지");
});

test("잠금: 오전→오후장, 오후→정가 시간, 하락 시 현재가", () => {
  assert.equal(lockProtection("am")?.protectSession, "pm");
  assert.equal(lockProtection("pm")?.protectSession, "list");
  assert.equal(lockProtection("list"), null);
  assert.equal(lockAppliedPriceWon(3000, 3200), 3000);
  assert.equal(lockAppliedPriceWon(3000, 2800), 2800);
  assert.equal(lockCodeAmountWon(3000, 3200), 200);
  assert.equal(lockCodeAmountWon(3000, 2800), 0);
});
