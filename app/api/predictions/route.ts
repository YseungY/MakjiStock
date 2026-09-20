import { currentPriceOf } from "@/lib/pricing/current-price";
import { kstNow } from "@/lib/market/calendar";
import { predictionSchedule } from "@/lib/predictions/schedule";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadPredictions } from "@/lib/bread-market/visitor-data";
import { getOrCreateVisitorHash } from "@/lib/visitor";

export const dynamic = "force-dynamic";

/* 가격 예측 — PRD §4.3 · §13
   POST /api/predictions  { ticker, direction: "up" | "down" }
   GET  /api/predictions

   1차 출시는 일반 예측만 받는다. 구매 후 기준가 예측은 Cafe24 주문과
   방문자를 잇는 다리가 생긴 뒤에 별도 범위로 판단한다.

   판정은 제출 시각과 상관없이 언제나 다음 날 06:00 오전가다
   (lib/predictions/schedule.ts). 잠금이 "오늘 오후가"를 맡으므로 예측까지
   같은 사건에 걸면 한 번의 가격 상승에 보상이 두 번 나간다.
   06:00 결과 확인이 다음 날 재방문 이유가 된다. docs/가격-잠금-1회-사유.md

   기준가는 클라이언트가 보내지 않는다. 서버가 daily_prices 에서 읽는다. */

const RATE_HIT_PCT = 3; // 일반 적중 (PRD §4.3)

/** 화면은 티커로 생각한다. 상품 id 는 서버가 찾는다. */
async function tickerToProductId(ticker: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("products")
    .select("id")
    .eq("ticker", ticker)
    .eq("active", true)
    .maybeSingle();
  return data?.id ?? null;
}


/* 화면은 이제 페이지 렌더에서 loadPredictions 을 직접 부른다(page-data.ts).
   이 경로는 같은 값을 밖에서 들여다보기 위해 남겨 둔다. */
export async function GET() {
  try {
    return Response.json({ predictions: await loadPredictions() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    ticker?: string;
    productId?: string;
    direction?: string;
  };
  const direction = body.direction === "up" || body.direction === "down" ? body.direction : null;
  if (!direction) {
    return Response.json({ error: "direction 은 up 또는 down 이어야 합니다." }, { status: 400 });
  }
  if (!body.ticker && !body.productId) {
    return Response.json({ error: "ticker 또는 productId 가 필요합니다." }, { status: 400 });
  }

  const { date, hour } = kstNow();
  if (hour < 6) {
    return Response.json(
      { error: "정가 시간에는 예측할 수 없습니다. 06:00 오전가부터 가능합니다." },
      { status: 409 },
    );
  }

  const db = supabaseAdmin();
  const target = predictionSchedule(date, hour);

  const productId = body.productId ?? (await tickerToProductId(body.ticker!));
  if (!productId) {
    return Response.json({ error: `상품을 찾을 수 없습니다: ${body.ticker}` }, { status: 404 });
  }

  // 기준가는 서버가 정한다 — 지금 화면에 떠 있는 확정가
  /* 기준가는 오늘 확정가다. 아직 안 나왔으면(검색지수 보류 등) 몰도 화면도
     정가 상태라 기준 삼을 값이 없다. 정가를 기준가로 쓰면 다음 날 판정이
     항상 "내렸다"가 된다. */
  const price = await currentPriceOf(productId, target.referenceDate, target.submitSession);
  if (!price) {
    return Response.json(
      { error: "오늘 가격이 아직 나오지 않았어요. 잠시 뒤 다시 시도해주세요." },
      { status: 409 },
    );
  }

  // 라운드는 첫 제출 때 만든다. 따로 크론을 두지 않는다.
  const roundId = `${date}-${target.targetSession}`;
  const { error: roundError } = await db.from("prediction_rounds").upsert(
    {
      id: roundId,
      round_date: date,
      target_publish_date: target.targetDate,
      target_session: target.targetSession,
      closes_at: target.closesAt,
      status: "open",
    },
    { onConflict: "id" },
  );
  if (roundError) return Response.json({ error: roundError.message }, { status: 502 });

  const visitorHash = await getOrCreateVisitorHash();
  const { data: entry, error } = await db
    .from("prediction_entries")
    .insert({
      round_id: roundId,
      role: "general",
      visitor_hash: visitorHash,
      product_id: productId,
      direction,
      reference_price_won: price.priceWon,
      target_publish_date: target.targetDate,
      target_session: target.targetSession,
      result: "pending",
      reward_rate_pct: 0,
    })
    .select("id,product_id,direction,reference_price_won,target_publish_date,target_session,result")
    .single();

  if (error) {
    // (round_id, visitor_hash) 부분 유니크 — 한 라운드 1회 (PRD §13.5)
    if (error.code === "23505") {
      return Response.json(
        { error: "이번 회차에는 이미 예측했습니다. 다음 장에 다시 참여할 수 있어요." },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json(
    { entry, targetLabel: target.label, rewardOnHitPct: RATE_HIT_PCT },
    { status: 201 },
  );
}
