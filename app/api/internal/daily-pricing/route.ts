import { marketSnapshot } from "@/components/makji/demo-data";

export async function POST() {
  return Response.json({
    ok: true,
    mode: "dry-run",
    schedule: "05:45 collect → 05:55 calculate → 05:57 Cafe24 PUT → 06:00 publish; 16:00 republish",
    cafe24: "not-called-without-server-token",
    formula:
      "min(38, searchRatio*0.10 + clamp(fxDeclinePct*0.28*50, -28, 28)), price rounded to 10 won",
    products: marketSnapshot.products.map((product) => ({
      productId: product.id,
      ticker: product.ticker,
      targetPriceWon: product.todayPriceWon,
      discountPct: product.totalDiscountPct,
    })),
  });
}
