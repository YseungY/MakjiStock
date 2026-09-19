import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/* 화면이 쓰는 시세. daily_prices 를 그대로 내보낸다.
   클라이언트에서 다시 계산하지 않는다 — 화면 숫자와 Cafe24 에 보낸 값이
   갈라지면 안 된다. */

const HISTORY_DAYS = 91; // 차트가 그리는 구간

export async function GET() {
  const db = supabaseAdmin();

  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
  const [{ data: products, error: productError }, { data: prices, error: priceError }] = await Promise.all([
    db.from("products").select("id,ticker,name,base_price_won").eq("active", true).order("ticker"),
    db
      .from("daily_prices")
      .select(
        "product_id,publish_date,price_session,search_ratio,search_discount_pct,fx_decline_pct,fx_discount_pct,fx_current_date,discount_pct,base_price_won,price_won",
      )
      .gte("publish_date", since)
      .order("publish_date"),
  ]);

  if (productError || priceError) {
    return Response.json({ error: (productError ?? priceError)?.message }, { status: 502 });
  }

  const tickerById = new Map((products ?? []).map((p) => [p.id, p.ticker]));

  const quotes = (prices ?? [])
    .filter((row) => tickerById.has(row.product_id))
    .map((row) => ({
      ticker: tickerById.get(row.product_id)!,
      publishDate: row.publish_date,
      session: row.price_session as "am" | "pm",
      searchRatio: Number(row.search_ratio),
      searchDiscountPct: Number(row.search_discount_pct),
      fxDeclinePct: Number(row.fx_decline_pct),
      fxDiscountPct: Number(row.fx_discount_pct),
      discountPct: Number(row.discount_pct),
      basePriceWon: row.base_price_won,
      priceWon: row.price_won,
      fxCurrentDate: row.fx_current_date,
    }));

  const latestDate = quotes.at(-1)?.publishDate ?? null;

  /* 막지지수를 서버에서 계산해 내려보낸다.
     화면에서 평균을 내면 어떤 상품이 빠졌는지에 따라 값이 달라지고, 그러면
     같은 날짜에 대해 서버와 화면이 다른 지수를 말하게 된다.
     지수 = 정가 대비 판매가 비율의 평균 × 100. 정가면 100, 10% 할인이면 90. */
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const q of quotes) {
    const key = `${q.publishDate}|${q.session}`;
    const bucket = buckets.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += q.priceWon / q.basePriceWon;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const indexSeries = [...buckets.entries()]
    .map(([key, { sum, count }]) => {
      const [publishDate, session] = key.split("|");
      return {
        publishDate,
        session: session as "am" | "pm",
        index: (sum / count) * 100,
        products: count,
      };
    })
    .sort((a, b) => (a.publishDate === b.publishDate ? (a.session < b.session ? -1 : 1) : a.publishDate < b.publishDate ? -1 : 1));

  return Response.json(
    {
      source: "supabase",
      latestDate,
      days: new Set(quotes.map((q) => q.publishDate)).size,
      products: (products ?? []).map((p) => ({
        id: p.id,
        ticker: p.ticker,
        name: p.name,
        basePriceWon: p.base_price_won,
      })),
      quotes,
      indexSeries,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
