/* 일일 가격 산정 크론의 판단 로직 — app/api/internal/daily-pricing 에서 떼어냈다.

   DB·Cafe24 를 만지지 않는 순수 함수만 둔다. 크론 본체는 외부 호출이 얽혀
   테스트하기 어렵지만, 틀리면 가격이 잘못 나가는 판단은 전부 여기 있다.
   tests/cron-session.test.mjs · tests/daily-job.test.mjs 가 고정한다. */

export type Session = "am" | "pm";

/**
 * 어느 장의 가격을 만들지 정한다.
 *   1) ?session= 이 있으면 그대로
 *   2) Vercel 크론이면 x-vercel-cron-schedule 헤더로 판별한다.
 *      Hobby 는 지정 시각이 아니라 그 시간대 안 아무 때나 실행하므로
 *      (05:55 로 걸어도 05:00~05:59 사이) 현재 시각으로는 구분할 수 없다.
 *   3) 그 외에는 KST 시각으로 추정한다.
 */
export function resolveSession(
  param: string | null,
  cronSchedule: string | null,
  kstHour: number,
): Session {
  if (param === "am" || param === "pm") return param;

  if (cronSchedule) {
    // UTC 시(hour) 필드. 20시대=05시대 KST(오전장 준비), 6시대=15시대 KST(오후장 준비)
    const utcHour = Number(cronSchedule.trim().split(/\s+/)[1]);
    if (Number.isFinite(utcHour)) return utcHour === 6 ? "pm" : "am";
  }

  return kstHour >= 15 && kstHour < 24 ? "pm" : "am";
}

/**
 * 마진이 허용하는 최대 할인율(%p). 정책 상한과 비교해 더 작은 쪽을 쓴다.
 *
 *   Dmargin = (정가마진 − 최소마진) / (1 − 최소마진)
 *
 * 뺄셈이 아니다. 분모가 1이 아니라 (1 − 최소마진)이라서 단순히 빼면
 * 실제보다 큰 할인을 허용하게 된다. docs/가격정책-마진연동-계산안.md §4
 * 마진 자료가 없는 상품(null)은 정책 상한을 그대로 쓴다.
 */
export function marginCapPct(
  product: { list_margin_pct: number | null; min_margin_pct: number | null },
  policyCapPct: number,
): number {
  const m0 = product.list_margin_pct;
  const mMin = product.min_margin_pct;
  if (m0 === null || mMin === null) return policyCapPct;
  const d = ((m0 - mMin) / (100 - mMin)) * 100;
  return Math.min(policyCapPct, d);
}

/**
 * 상품별 직전 확정가. 화면의 전일 대비 등락률 기준값이다 (PRD §8.4).
 *
 * 같은 날짜에 오전가·오후가가 둘 다 있으므로 날짜만으로는 어느 쪽이 직전인지
 * 정해지지 않는다. 오후가가 그날의 마지막 확정가라 오후가를 먼저 본다.
 * 입력은 publish_date 내림차순으로 정렬돼 있다고 본다.
 */
export function pickPreviousPrices(
  rows: { product_id: string; price_won: number; publish_date: string; price_session: string }[],
): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    if (a.publish_date !== b.publish_date) return a.publish_date < b.publish_date ? 1 : -1;
    // 같은 날이면 오후장이 먼저다 ("pm" > "am")
    return a.price_session < b.price_session ? 1 : a.price_session > b.price_session ? -1 : 0;
  });

  const latest = new Map<string, number>();
  for (const row of sorted) {
    if (!latest.has(row.product_id)) latest.set(row.product_id, row.price_won);
  }
  return latest;
}
