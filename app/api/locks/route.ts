import pricingConfig from "@/config/pricing-products.json";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateVisitorHash, readVisitorHash } from "@/lib/visitor";

export const dynamic = "force-dynamic";

/* 가격 잠금 — PRD §4.4 · §13.5
   POST /api/locks   { ticker } 또는 { productId }   현재 장의 확정가로 잠근다
   GET  /api/locks                   오늘 내 잠금을 돌려준다

   하루 1회·빵 1개 제한은 DB 유니크 제약이 강제한다 (visitor_hash, lock_date).
   해지해도 같은 날 잠금권은 복구하지 않는다.

   잠금가는 클라이언트가 보내지 않는다. 서버가 daily_prices 에서 읽는다 —
   값을 받으면 원하는 가격에 잠글 수 있다. */

function kstNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* 보호 구간 — 오전 잠금은 당일 16:00~23:59, 오후 잠금은 다음 날 00:00~04:59 (KST).
   05:00~05:59 는 정가 리셋 시간이라 잠금가 구매도 받지 않는다. */
function protectionWindow(lockDate: string, session: "am" | "pm") {
  if (session === "am") {
    return { from: `${lockDate}T16:00:00+09:00`, until: `${lockDate}T23:59:59+09:00`, label: "오늘 16:00–23:59" };
  }
  const next = addDays(lockDate, 1);
  return { from: `${next}T00:00:00+09:00`, until: `${next}T04:59:59+09:00`, label: "내일 00:00–04:59" };
}

export async function GET() {
  const visitorHash = await readVisitorHash();
  if (!visitorHash) return Response.json({ lock: null });

  const { date } = kstNow();
  const { data, error } = await supabaseAdmin()
    .from("price_locks")
    .select("id,product_id,lock_date,lock_session,locked_price_won,protect_from,protect_until,status,lock_code_amount_won")
    .eq("visitor_hash", visitorHash)
    .eq("lock_date", date)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 502 });
  return Response.json({ lock: data ?? null });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    productId?: string;
    ticker?: string;
  };
  if (!body.productId && !body.ticker) {
    return Response.json({ error: "ticker 또는 productId 가 필요합니다." }, { status: 400 });
  }

  const { date, hour } = kstNow();
  // 00:00~05:59 는 정가 구간이다. 잠글 대상 시세가 없다.
  if (hour < 6) {
    return Response.json(
      { error: "정가 시간에는 잠글 수 없습니다. 06:00 오전가부터 가능합니다." },
      { status: 409 },
    );
  }
  const session: "am" | "pm" = hour >= 16 ? "pm" : "am";

  const db = supabaseAdmin();
  const formulaVersion =
    (pricingConfig.pricing as { formulaVersion?: string }).formulaVersion ?? "v0.7";

  // 화면은 티커로 생각한다. 상품 id 는 서버가 찾는다.
  let productId = body.productId;
  if (!productId) {
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq("ticker", body.ticker!)
      .eq("active", true)
      .maybeSingle();
    if (!product) {
      return Response.json({ error: `상품을 찾을 수 없습니다: ${body.ticker}` }, { status: 404 });
    }
    productId = product.id;
  }

  // 잠금가는 서버가 정한다
  const { data: price, error: priceError } = await db
    .from("daily_prices")
    .select("price_won,product_id")
    .eq("product_id", productId)
    .eq("publish_date", date)
    .eq("price_session", session)
    .eq("formula_version", formulaVersion)
    .maybeSingle();

  if (priceError) return Response.json({ error: priceError.message }, { status: 502 });
  if (!price) {
    return Response.json(
      { error: "오늘 이 상품의 확정가가 아직 없습니다." },
      { status: 409 },
    );
  }

  const visitorHash = await getOrCreateVisitorHash();
  const window = protectionWindow(date, session);

  const { data: inserted, error } = await db
    .from("price_locks")
    .insert({
      visitor_hash: visitorHash,
      product_id: price.product_id,
      lock_date: date,
      lock_session: session,
      locked_price_won: price.price_won,
      protect_from: window.from,
      protect_until: window.until,
      // 이메일 인증은 쿠폰 발급 단계에서 받는다. 잠금 자체는 바로 유효하다.
      status: "active",
      formula_version: formulaVersion,
    })
    .select("id,product_id,lock_session,locked_price_won,protect_from,protect_until,status")
    .single();

  if (error) {
    // (visitor_hash, lock_date) 유니크 — 하루 1회 제한에 걸린 경우
    if (error.code === "23505") {
      return Response.json(
        { error: "오늘은 이미 잠금을 사용했습니다. 하루에 한 번, 빵 한 개만 잠글 수 있습니다." },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 502 });
  }

  return Response.json({ lock: inserted, protectLabel: window.label }, { status: 201 });
}
