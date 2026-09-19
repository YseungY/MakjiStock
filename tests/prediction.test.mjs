import assert from "node:assert/strict";
import test from "node:test";

/* app/api/predictions 의 targetOf 와 같은 규칙.
   가격이 하루 두 번 바뀌므로 "내일"만으로는 어느 가격인지 정해지지 않는다.
   제출 시점이 판정 기준을 정한다. */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function targetOf(date, hour) {
  if (hour >= 16) {
    return { submitSession: "pm", targetDate: addDays(date, 1), targetSession: "am" };
  }
  return { submitSession: "am", targetDate: date, targetSession: "pm" };
}

/* lib/bread-market/reward-policy.ts 의 판정 규칙 */
function resolveDirection(direction, referenceWon, resultWon) {
  if (resultWon === referenceWon) return "void";
  const rose = resultWon > referenceWon;
  return (direction === "up") === rose ? "hit" : "miss";
}
const RATE = { hit: 3, miss: 0, void: 3 };

test("오전장 제출은 오늘 오후가로 판정한다", () => {
  for (const hour of [6, 10, 15]) {
    const t = targetOf("2026-09-21", hour);
    assert.equal(t.submitSession, "am");
    assert.equal(t.targetDate, "2026-09-21");
    assert.equal(t.targetSession, "pm");
  }
});

test("오후장 제출은 내일 오전가로 판정한다", () => {
  for (const hour of [16, 20, 23]) {
    const t = targetOf("2026-09-21", hour);
    assert.equal(t.submitSession, "pm");
    assert.equal(t.targetDate, "2026-09-22");
    assert.equal(t.targetSession, "am");
  }
});

test("월말을 넘어가도 날짜가 맞는다", () => {
  assert.equal(targetOf("2026-09-30", 20).targetDate, "2026-10-01");
});

test("적중·미적중·무효", () => {
  assert.equal(resolveDirection("up", 4000, 4200), "hit");
  assert.equal(resolveDirection("up", 4000, 3800), "miss");
  assert.equal(resolveDirection("down", 4000, 3800), "hit");
  assert.equal(resolveDirection("down", 4000, 4200), "miss");
  // 가격이 같으면 방향과 무관하게 무효 (PRD §4.3)
  assert.equal(resolveDirection("up", 4000, 4000), "void");
  assert.equal(resolveDirection("down", 4000, 4000), "void");
});

test("무효는 미적중이 아니라 전원 3%다", () => {
  assert.equal(RATE[resolveDirection("up", 4000, 4000)], 3);
  assert.equal(RATE[resolveDirection("up", 4000, 3800)], 0);
});
