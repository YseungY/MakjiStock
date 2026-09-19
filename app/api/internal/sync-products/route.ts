import { cafe24Request } from "@/lib/cafe24/client";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* Cafe24 상품 목록을 읽어 products.cafe24_product_no 를 채운다.
   GET  드라이런 — 무엇이 매칭됐는지만 보여준다
   POST 실제 반영
   상품 등록·콘텐츠 변경은 하지 않는다 (RFP: AI 자동 생성·업로드 금지). */

type Cafe24Product = { product_no: number; product_name: string; price?: string };

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** 공백·대소문자·괄호를 지워 비교한다. 몰에 등록된 이름이 조금 달라도 잡히게. */
function normalize(name: string) {
  return name.replace(/[\s()[\]{}·・,]/g, "").toLowerCase();
}

async function buildPlan() {
  const shopNo = Number(process.env.CAFE24_SHOP_NO ?? 1);
  const { products: remote } = await cafe24Request<{ products: Cafe24Product[] }>(
    `/api/v2/admin/products?shop_no=${shopNo}&limit=100&fields=product_no,product_name,price`,
  );

  const { data: local, error } = await supabaseAdmin()
    .from("products")
    .select("id,ticker,name,base_price_won,cafe24_product_no")
    .order("ticker");
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);

  const matches = (local ?? []).map((row) => {
    const target = normalize(row.name);
    const exact = remote.find((item) => normalize(item.product_name) === target);
    // 정확히 안 맞으면 한쪽이 다른 쪽을 포함하는지 본다
    const loose =
      exact ??
      remote.find((item) => {
        const candidate = normalize(item.product_name);
        return candidate.includes(target) || target.includes(candidate);
      });
    return {
      id: row.id,
      ticker: row.ticker,
      name: row.name,
      currentProductNo: row.cafe24_product_no,
      matchedProductNo: loose?.product_no ?? null,
      matchedName: loose?.product_name ?? null,
      confidence: exact ? "exact" : loose ? "loose" : "none",
    };
  });

  const usedNos = new Set(matches.map((m) => m.matchedProductNo).filter(Boolean));
  return {
    shopNo,
    cafe24Products: remote.map((item) => ({
      product_no: item.product_no,
      product_name: item.product_name,
      price: item.price,
      claimed: usedNos.has(item.product_no),
    })),
    matches,
    unmatched: matches.filter((m) => m.confidence === "none").map((m) => m.ticker),
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const plan = await buildPlan();
    return Response.json({ mode: "dry-run", ...plan, note: "반영하려면 같은 경로로 POST 하세요." });
  } catch (cause) {
    return Response.json({ error: String(cause instanceof Error ? cause.message : cause) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const plan = await buildPlan();
    const writable = plan.matches.filter((m) => m.matchedProductNo !== null);
    if (writable.length === 0) {
      return Response.json({ error: "매칭된 상품이 없습니다.", ...plan }, { status: 409 });
    }

    const db = supabaseAdmin();
    for (const match of writable) {
      const { error } = await db
        .from("products")
        .update({ cafe24_product_no: match.matchedProductNo })
        .eq("id", match.id);
      if (error) throw new Error(`${match.ticker} 저장 실패: ${error.message}`);
    }

    return Response.json({
      mode: "committed",
      updated: writable.map((m) => ({ ticker: m.ticker, productNo: m.matchedProductNo, confidence: m.confidence })),
      unmatched: plan.unmatched,
    });
  } catch (cause) {
    return Response.json({ error: String(cause instanceof Error ? cause.message : cause) }, { status: 502 });
  }
}
