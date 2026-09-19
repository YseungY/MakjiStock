import assert from "node:assert/strict";
import test from "node:test";

/* app/api/internal/daily-pricing 의 resolveSession 과 같은 규칙.
   Hobby 크론은 지정 시각이 아니라 그 시간대 안 아무 때나 실행되므로
   현재 시각으로는 오전장/오후장을 구분할 수 없다. 스케줄 헤더로 판별한다. */
function resolveSession(param, schedule, kstHour) {
  if (param === "am" || param === "pm") return param;
  if (schedule) {
    const utcHour = Number(schedule.trim().split(/\s+/)[1]);
    if (Number.isFinite(utcHour)) return utcHour === 6 ? "pm" : "am";
  }
  return kstHour >= 15 && kstHour < 24 ? "pm" : "am";
}

test("쿼리 파라미터가 가장 우선한다", () => {
  assert.equal(resolveSession("pm", "0 20 * * *", 5), "pm");
  assert.equal(resolveSession("am", "0 6 * * *", 15), "am");
});

test("크론 스케줄로 장을 구분한다", () => {
  // UTC 20시대 = KST 05시대 → 06:00 오전가 준비
  assert.equal(resolveSession(null, "0 20 * * *", 5), "am");
  // UTC 6시대 = KST 15시대 → 16:00 오후가 준비
  assert.equal(resolveSession(null, "0 6 * * *", 15), "pm");
});

test("Hobby 지터가 있어도 스케줄 헤더는 그대로다", () => {
  // 05:00 에 실행되든 05:59 에 실행되든 같은 스케줄에서 왔다
  for (const hour of [5, 5.99]) {
    assert.equal(resolveSession(null, "0 20 * * *", hour), "am");
  }
  for (const hour of [15, 15.99]) {
    assert.equal(resolveSession(null, "0 6 * * *", hour), "pm");
  }
});

test("시각 추정만으로는 15시대를 오후장으로 본다", () => {
  // 크론이 아닌 수동 호출일 때의 대체 규칙
  assert.equal(resolveSession(null, null, 5), "am");
  assert.equal(resolveSession(null, null, 10), "am");
  assert.equal(resolveSession(null, null, 15), "pm");
  assert.equal(resolveSession(null, null, 23), "pm");
});

test("스케줄 헤더가 이상하면 시각 추정으로 내려간다", () => {
  assert.equal(resolveSession(null, "garbage", 15), "pm");
  assert.equal(resolveSession(null, "", 5), "am");
});
