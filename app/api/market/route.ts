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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
