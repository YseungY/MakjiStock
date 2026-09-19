import assert from "node:assert/strict";
import test from "node:test";
import { marginCapPct, pickPreviousPrices } from "../lib/pricing/daily-job.ts";

/* 크론이 가격을 만들기 전에 내리는 판단들. 틀리면 잘못된 가격이 몰에 나간다. */

test("마진 자료가 없으면 정책 상한을 그대로 쓴다", () => {
  assert.equal(marginCapPct({ list_margin_pct: null, min_margin_pct: null }, 38), 38);
  assert.equal(marginCapPct({ list_margin_pct: 60, min_margin_pct: null }, 38), 38);
  assert.equal(marginCapPct({ list_margin_pct: null, min_margin_pct: 20 }, 38), 38);
});

test("마진 상한은 뺄셈이 아니다 — (m0-mMin)/(1-mMin)", () => {
  // 정가마진 30%, 최소마진 20% → 10%p 가 아니라 12.5%
  assert.equal(marginCapPct({ list_margin_pct: 30, min_margin_pct: 20 }, 38), 12.5);
  // 정가마진 25%, 최소마진 20% → 6.25%
  assert.equal(marginCapPct({ list_margin_pct: 25, min_margin_pct: 20 }, 38), 6.25);
  // 정가마진 40%, 최소마진 20% → 25%
  assert.equal(marginCapPct({ list_margin_pct: 40, min_margin_pct: 20 }, 38), 25);
});

test("마진이 넉넉해도 정책 상한 38%를 넘지 않는다", () => {
  // (80-20)/80 = 75% 지만 정책이 38% 에서 자른다
  assert.equal(marginCapPct({ list_margin_pct: 80, min_margin_pct: 20 }, 38), 38);
});

test("최소마진이 정가마진보다 크면 할인하지 않는다", () => {
  assert.ok(marginCapPct({ list_margin_pct: 15, min_margin_pct: 20 }, 38) < 0);
});

const row = (product_id, publish_date, price_session, price_won) => ({
  product_id,
  publish_date,
  price_session,
  price_won,
});

test("같은 날 오전·오후가 다 있으면 오후가가 직전 확정가다", () => {
  /* 날짜만으로 정렬하면 같은 날 안에서 순서가 정해지지 않아
     오전가를 직전으로 집을 수 있다. 그러면 등락률이 틀린다 (PRD §8.4). */
  const previous = pickPreviousPrices([
    row("morning_roll", "2026-09-18", "am", 3780),
    row("morning_roll", "2026-09-18", "pm", 4250),
  ]);
  assert.equal(previous.get("morning_roll"), 4250);
});

test("입력 순서가 뒤집혀 와도 같은 답을 낸다", () => {
  const previous = pickPreviousPrices([
    row("morning_roll", "2026-09-18", "pm", 4250),
    row("morning_roll", "2026-09-18", "am", 3780),
  ]);
  assert.equal(previous.get("morning_roll"), 4250);
});

test("더 최근 날짜가 이긴다", () => {
  const previous = pickPreviousPrices([
    row("morning_roll", "2026-09-17", "pm", 3000),
    row("morning_roll", "2026-09-18", "am", 3780),
  ]);
  assert.equal(previous.get("morning_roll"), 3780);
});

test("상품마다 따로 고른다", () => {
  const previous = pickPreviousPrices([
    row("morning_roll", "2026-09-18", "pm", 4250),
    row("scone", "2026-09-17", "pm", 2900),
  ]);
  assert.equal(previous.get("morning_roll"), 4250);
  assert.equal(previous.get("scone"), 2900);
  assert.equal(previous.get("없는상품"), undefined);
});

test("이력이 없으면 빈 Map 이다 — 등락률은 '-' 가 된다", () => {
  assert.equal(pickPreviousPrices([]).size, 0);
});
