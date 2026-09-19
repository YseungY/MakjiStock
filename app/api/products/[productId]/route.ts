import { products } from "@/components/makji/demo-data";

export async function GET(request: Request) {
  const productId = new URL(request.url).pathname.split("/").at(-1);
  const product = products.find((item) => item.id === productId);

  if (!product) {
    return Response.json({ error: "product not found" }, { status: 404 });
  }

  return Response.json({
    product,
    quote: {
      priceWon: product.todayPriceWon,
      previousPriceWon: product.previousPriceWon,
      priceChangeWon: product.todayPriceWon - product.previousPriceWon,
      priceChangePct:
        product.previousPriceWon === 0
          ? 0
          : (product.todayPriceWon / product.previousPriceWon - 1) * 100,
      searchRatio: product.searchRatio,
      previousSearchRatio: product.previousSearchRatio,
      searchChangePoint: product.searchChangePoint,
      searchCouponPct: product.searchCouponPct,
      fxDeclinePct: product.fxDeclinePct,
      fxAdjustmentPct: product.fxAdjustmentPct,
      discountPct: product.totalDiscountPct,
      searchSignalDate: "2026-09-15",
      fxCurrentDate: "2026-09-15",
      fxPreviousDate: "2026-09-14",
    },
    history: product.history,
  });
}
