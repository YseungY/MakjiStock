import { supabaseAdmin } from "@/lib/supabase/admin";

/* 지금 화면에 떠 있는 확정가를 돌려준다.

   비영업일 오후에는 당일 시가가 없어 새 가격을 만들지 않고 오전 확정가를
   유지한다 (PRD §9.3). 화면의 quoteAt 도 pm 행이 없으면 am 을 쓴다.
   서버가 이 폴백을 안 하면 "지금 가격"이 화면과 갈라진다 — 사용자가 보는
   가격과 다른 값으로 잠기거나 예측 기준이 잡힌다. */

export type CurrentPrice = {
  productId: string;
  priceWon: number;
  /** 실제로 사용한 세션. 요청한 세션과 다르면 폴백이 일어난 것이다. */
  session: "am" | "pm";
};

export async function currentPriceOf(
  productId: string,
  publishDate: string,
  session: "am" | "pm",
): Promise<CurrentPrice | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_prices")
    .select("price_won,price_session")
    .eq("product_id", productId)
    .eq("publish_date", publishDate)
    .in("price_session", session === "pm" ? ["pm", "am"] : ["am"]);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  // pm 을 요청했으면 pm 우선, 없으면 am
  const row = rows.find((r) => r.price_session === session) ?? rows.find((r) => r.price_session === "am");
  if (!row) return null;
  return {
    productId,
    priceWon: row.price_won,
    session: row.price_session as "am" | "pm",
  };
}
