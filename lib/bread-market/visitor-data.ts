import { decryptSecret } from "@/lib/crypto";
import { kstNow } from "@/lib/market/calendar";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readVisitorHash } from "@/lib/visitor";

/* 이 브라우저의 잠금·예측. 쿠키(visitor_token)가 본인 확인을 대신하므로
   자기 것만 나온다.

   쿠키를 읽기만 한다 — 발급은 Route Handler 몫이다. 그래서 페이지 렌더에서
   불러도 된다. 쿠키가 없는 첫 방문자는 빈 값이 나오는데, 잠금도 예측도
   아직 없는 게 맞다.

   부르는 쪽은 반드시 dynamic 이어야 한다. 사람마다 다른 값이라 HTML 이
   캐시되면 남의 잠금이 보인다. */

export type ServerLockRow = {
  lock_date: string;
  lock_session: "am" | "pm";
  locked_price_won: number;
  lock_code_amount_won: number | null;
  status: string;
  products: { ticker: string; name: string } | null;
};

export type LockData = {
  lock: ServerLockRow | null;
  discountCode: string | null;
  validUntil: string | null;
};

export const EMPTY_LOCK: LockData = { lock: null, discountCode: null, validUntil: null };

/** 관계 컬럼은 supabase-js 가 객체로도 배열로도 추론한다. 첫 건만 쓴다. */
function oneProduct(p: unknown): { ticker: string; name: string } | null {
  const row = Array.isArray(p) ? p[0] : p;
  if (!row || typeof row !== "object") return null;
  const { ticker, name } = row as { ticker?: string; name?: string };
  return ticker ? { ticker, name: name ?? "" } : null;
}

export async function loadLock(): Promise<LockData> {
  const visitorHash = await readVisitorHash();
  if (!visitorHash) return EMPTY_LOCK;

  const { date } = kstNow();
  const db = supabaseAdmin();

  // date 는 02:00 에 바뀌는 시장 날짜라 자정 뒤 보호 구간도 같은 날 잠금이다.
  const { data, error } = await db
    .from("price_locks")
    .select(
      "id,product_id,lock_date,lock_session,locked_price_won,protect_from,protect_until,status,lock_code_amount_won,current_price_won_at_protect,reward_claim_id,products(ticker,name)",
    )
    .eq("visitor_hash", visitorHash)
    .eq("lock_date", date)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return EMPTY_LOCK;

  /* 차액 할인코드는 이메일로 보내지 않고 여기서 바로 내려준다. */
  let discountCode: string | null = null;
  let validUntil: string | null = null;
  if (data.reward_claim_id) {
    const { data: claim } = await db
      .from("reward_claims")
      .select("discount_code_ciphertext,valid_until,status")
      .eq("id", data.reward_claim_id)
      .maybeSingle();
    if (claim?.discount_code_ciphertext) {
      try {
        discountCode = decryptSecret(claim.discount_code_ciphertext);
        validUntil = claim.valid_until;
      } catch {
        // 키가 바뀌었거나 값이 깨진 경우. 잠금 정보는 그대로 보여준다.
        discountCode = null;
      }
    }
  }

  return {
    lock: {
      lock_date: data.lock_date,
      lock_session: data.lock_session as "am" | "pm",
      locked_price_won: data.locked_price_won,
      lock_code_amount_won: data.lock_code_amount_won,
      status: data.status,
      products: oneProduct(data.products),
    },
    discountCode,
    validUntil,
  };
}

export type ServerPredictionRow = {
  id: string;
  direction: "up" | "down";
  reference_price_won: number;
  target_publish_date: string;
  target_session: "am" | "pm";
  result: "pending" | "hit" | "miss" | "void";
  result_price_won: number | null;
  reward_rate_pct: number;
  products: { ticker: string; name: string } | null;
  reward: { code: string; amountWon: number | null; validUntil: string | null } | null;
};

export async function loadPredictions(): Promise<ServerPredictionRow[]> {
  const visitorHash = await readVisitorHash();
  if (!visitorHash) return [];

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("prediction_entries")
    .select(
      "id,product_id,direction,reference_price_won,target_publish_date,target_session,result,result_price_won,reward_rate_pct,submitted_at,resolved_at,products(ticker,name)",
    )
    .eq("visitor_hash", visitorHash)
    .eq("role", "general")
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const entries = data ?? [];
  const hitIds = entries.filter((e) => e.result === "hit" || e.result === "void").map((e) => e.id);

  /* 보상 코드도 여기서 바로 내려준다. 자기 예측의 코드만 보인다. */
  const codes = new Map<string, { code: string; amountWon: number | null; validUntil: string | null }>();
  if (hitIds.length > 0) {
    const { data: claims } = await db
      .from("reward_claims")
      .select("prediction_entry_id,discount_code_ciphertext,amount_won,valid_until")
      .in("prediction_entry_id", hitIds);
    for (const claim of claims ?? []) {
      if (!claim.discount_code_ciphertext || !claim.prediction_entry_id) continue;
      try {
        codes.set(claim.prediction_entry_id, {
          code: decryptSecret(claim.discount_code_ciphertext),
          amountWon: claim.amount_won,
          validUntil: claim.valid_until,
        });
      } catch {
        // 키가 바뀌었거나 값이 깨진 경우. 예측 기록은 그대로 보여준다.
      }
    }
  }

  return entries.map((e) => ({
    id: e.id,
    direction: e.direction as "up" | "down",
    reference_price_won: e.reference_price_won,
    target_publish_date: e.target_publish_date,
    target_session: e.target_session as "am" | "pm",
    result: e.result as ServerPredictionRow["result"],
    result_price_won: e.result_price_won,
    reward_rate_pct: e.reward_rate_pct,
    products: oneProduct(e.products),
    reward: codes.get(e.id) ?? null,
  }));
}
