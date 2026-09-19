import { marketSnapshot, products } from "@/components/makji/demo-data";

/* 데모 API — PRD v0.6 예측 규칙
   role: general(오늘 확정가 대비) | buyer(내 매수가 대비), direction: up | down */
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    productId?: string;
    role?: string;
    direction?: string;
    referencePriceWon?: number;
  };
  const product = products.find((item) => item.id === payload.productId);
  const role = payload.role === "buyer" ? "buyer" : payload.role === "general" ? "general" : null;
  const direction = payload.direction === "up" || payload.direction === "down" ? payload.direction : null;

  if (!product || !role || !direction) {
    return Response.json({ error: "productId, role(general|buyer), direction(up|down) are required" }, { status: 400 });
  }

  return Response.json(
    {
      id: `prediction-demo-${Date.now()}`,
      roundId: marketSnapshot.predictionRound.id,
      productId: product.id,
      role,
      direction,
      referencePriceWon: payload.referencePriceWon ?? product.todayPriceWon,
      status: "pending",
      submittedAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}
