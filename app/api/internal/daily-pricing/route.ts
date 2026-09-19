import pricingConfig from "@/config/pricing-products.json";
import { cafe24Request, cafe24ShopNo } from "@/lib/cafe24/client";
import { addDays, kstToday } from "@/lib/pricing/dates.mjs";
import { fetchUsdKrwOpenCloseRates } from "@/lib/pricing/fx.mjs";
import { fetchTrendsSeparately } from "@/lib/pricing/naver.mjs";
import {
  buildSessionFxSignals,
  calculateDay,
  type PricingConfig,
} from "@/lib/pricing/pricing.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

/* 일일 가격 산정 — PRD §11
   POST /api/internal/daily-pricing?session=am|pm&date=YYYY-MM-DD&commit=1

   백테스트(backtest/run.mjs)와 lib/pricing/ 의 같은 코드를 쓴다. 검증한 숫자와
   운영에서 나오는 숫자가 갈라지지 않게 하려는 것이다.

   commit 없이는 계산과 저장까지만 하고 Cafe24 는 건드리지 않는다. */

const SEARCH_WINDOW_DAYS = 90; // 백테스트와 같은 정규화 구간 (PRD §10.2)
const FX_LOOKBACK_DAYS = 12; // 연휴를 건너뛰고 직전 두 영업일을 찾기 위한 여유

type ProductRow = {
  id: string;
  ticker: string;
  name: string;
  base_price_won: number;
  cafe24_product_no: number | null;
  keywords: string[];
  list_margin_pct: number | null;
  min_margin_pct: number | null;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** KST 시각으로 지금이 오전장인지 오후장인지 정한다 (PRD §2). */
function currentSession(): "am" | "pm" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  return hour >= 16 ? "pm" : "am";
}

/* 마진이 허용하는 최대 할인율.
   Dmargin = (정가마진 - 최소마진) / (1 - 최소마진)
   뺄셈이 아니다. docs/가격정책-마진연동-계산안.md §4 */
function marginCapPct(product: ProductRow, policyCap: number): number {
  const m0 = product.list_margin_pct;
  const mMin = product.min_margin_pct;
  if (m0 === null || mMin === null) return policyCap;
  const d = ((m0 - mMin) / (100 - mMin)) * 100;
  return Math.min(policyCap, d);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const publishDate: string = url.searchParams.get("date") ?? kstToday();
  const sessionParam = url.searchParams.get("session");
  const session: "am" | "pm" =
    sessionParam === "am" || sessionParam === "pm" ? sessionParam : currentSession();
  const commit = url.searchParams.get("commit") === "1";

  const { formulaVersion = "v0.7", ...pricing } = pricingConfig.pricing as PricingConfig & {
    formulaVersion?: string;
  };
  const db = supabaseAdmin();
  const startedAt = new Date().toISOString();

  const { data: jobRow } = await db
    .from("job_runs")
    .insert({
      job_kind: "daily_pricing",
      target_date: publishDate,
      price_session: session,
      status: "collecting",
      formula_version: formulaVersion,
    })
    .select("id")
    .single();
  const jobId = jobRow?.id as string | undefined;

  const fail = async (stage: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (jobId) {
      await db
        .from("job_runs")
        .update({ status: "held", finished_at: new Date().toISOString(), error_code: stage, error_message: message })
        .eq("id", jobId);
    }
    return Response.json({ error: message, stage, publishDate, session }, { status: 502 });
  };

  try {
    // ── 상품 ────────────────────────────────────────────────
    const { data: products, error: productError } = await db
      .from("products")
      .select("id,ticker,name,base_price_won,cafe24_product_no,keywords,list_margin_pct,min_margin_pct")
      .eq("active", true)
      .order("ticker");
    if (productError) throw new Error(productError.message);
    const rows = (products ?? []) as ProductRow[];
    if (rows.length === 0) throw new Error("활성 상품이 없습니다.");

    // ── 수집 ────────────────────────────────────────────────
    const signalDate: string = addDays(publishDate, -1);
    const searchStart: string = addDays(signalDate, -(SEARCH_WINDOW_DAYS - 1));

    const trends = await fetchTrendsSeparately({
      products: rows.map((r) => ({ id: r.id, ticker: r.ticker, keywords: r.keywords })),
      startDate: searchStart,
      endDate: signalDate,
      log: () => {},
    });

    const fx = await fetchUsdKrwOpenCloseRates({
      startDate: addDays(publishDate, -FX_LOOKBACK_DAYS),
      endDate: publishDate,
      log: () => {},
    });

    const signals = buildSessionFxSignals({
      closesByDate: fx.closesByDate,
      opensByDate: fx.opensByDate,
      publishDates: [publishDate],
    });
    const fxSignal = session === "am" ? signals[publishDate]?.morning : signals[publishDate]?.afternoon;

    if (!fxSignal) {
      // 주말·공휴일 오후에는 당일 시가가 없다. 오전 확정가를 유지한다 (PRD §9.3).
      if (jobId) {
        await db
          .from("job_runs")
          .update({ status: "held", finished_at: new Date().toISOString(), error_code: "fx_unavailable" })
          .eq("id", jobId);
      }
      return Response.json({
        mode: "held",
        reason:
          session === "pm"
            ? "당일 시가가 없습니다(비영업일). 오전 확정가를 유지합니다."
            : "직전 두 영업일 종가를 찾지 못했습니다.",
        publishDate,
        session,
      });
    }

    // ── 계산 ────────────────────────────────────────────────
    const results = rows.map((product) => {
      const ratio = trends.seriesByProduct[product.id]?.[signalDate];
      if (!Number.isFinite(ratio)) {
        // 누락을 0 으로 대체하지 않는다 (PRD §10.3). 직전 가격을 유지한다.
        return { product, status: "held" as const, reason: "검색지수 없음" };
      }
      const cap = marginCapPct(product, pricing.discountCapPct);
      const calc = calculateDay({
        searchRatio: Math.abs(ratio),
        fxDeclinePct: fxSignal.declinePct,
        basePriceWon: product.base_price_won,
        pricing: { ...pricing, discountCapPct: cap },
      });
      return { product, status: "calculated" as const, calc };
    });

    // ── 저장 ────────────────────────────────────────────────
    await db.from("fx_rates").upsert(
      [
        { rate_date: fxSignal.previousDate, item_code: "0000003", rate_type: "close", usd_krw: fxSignal.previousRate },
        {
          rate_date: fxSignal.currentDate,
          item_code: session === "am" ? "0000003" : "0000002",
          rate_type: session === "am" ? "close" : "open",
          usd_krw: fxSignal.currentRate,
        },
      ],
      { onConflict: "rate_date,item_code" },
    );

    await db.from("trend_snapshots").upsert(
      rows
        .filter((p) => Number.isFinite(trends.seriesByProduct[p.id]?.[signalDate]))
        .map((p) => ({
          product_id: p.id,
          signal_date: signalDate,
          ratio: trends.seriesByProduct[p.id][signalDate],
          request_start_date: searchStart,
          request_end_date: signalDate,
          keyword_group_version: formulaVersion,
          provider: process.env.NAVER_PROVIDER || "hub",
        })),
      { onConflict: "product_id,signal_date,request_start_date,request_end_date,keyword_group_version" },
    );

    const calculated = results.filter((r) => r.status === "calculated");
    const { data: previous } = await db
      .from("daily_prices")
      .select("product_id,price_won,publish_date,price_session")
      .lt("publish_date", publishDate)
      .order("publish_date", { ascending: false })
      .limit(rows.length * 2);
    const prevByProduct = new Map<string, number>();
    for (const row of previous ?? []) {
      if (!prevByProduct.has(row.product_id)) prevByProduct.set(row.product_id, row.price_won);
    }

    const priceRows = calculated.map(({ product, calc }) => {
      const prev = prevByProduct.get(product.id) ?? null;
      return {
        product_id: product.id,
        publish_date: publishDate,
        price_session: session,
        signal_date: signalDate,
        formula_version: formulaVersion,
        search_ratio: Math.abs(trends.seriesByProduct[product.id][signalDate]),
        search_discount_pct: calc!.searchCouponPct,
        fx_previous_date: fxSignal.previousDate,
        fx_current_date: fxSignal.currentDate,
        fx_previous_rate: fxSignal.previousRate,
        fx_current_rate: fxSignal.currentRate,
        fx_decline_pct: fxSignal.declinePct,
        fx_discount_pct: calc!.fxAdjustmentPct,
        discount_pct: calc!.discountPct,
        base_price_won: product.base_price_won,
        price_won: calc!.priceWon,
        previous_price_won: prev,
        price_change_pct: prev ? (calc!.priceWon / prev - 1) * 100 : null,
        status: "calculated",
        cafe24_apply_status: "pending",
      };
    });

    const { error: priceError } = await db
      .from("daily_prices")
      .upsert(priceRows, { onConflict: "product_id,publish_date,price_session,formula_version" });
    if (priceError) throw new Error(`daily_prices 저장 실패: ${priceError.message}`);

    // ── Cafe24 반영 ─────────────────────────────────────────
    const shopNo = cafe24ShopNo();
    const applied: Record<string, string>[] = [];

    if (commit) {
      for (const { product, calc } of calculated) {
        if (!product.cafe24_product_no) {
          applied.push({ ticker: product.ticker, result: "skipped", reason: "cafe24_product_no 없음" });
          continue;
        }
        const path = `/api/v2/admin/products/${product.cafe24_product_no}?shop_no=${shopNo}`;
        try {
          /* 계산된 가격을 항상 PUT 한다. GET 으로 현재가를 먼저 보던 방식은
             호출이 2번이고, 같은 값이면 PUT 이 어차피 무해하다.
             대신 Cafe24 쪽 변경 전 가격은 남지 않는다. 우리 직전 가격은
             daily_prices.previous_price_won 에 이미 있다. */
          await cafe24Request(path, {
            method: "PUT",
            body: JSON.stringify({ shop_no: shopNo, request: { price: String(calc!.priceWon) } }),
          });
          await db
            .from("daily_prices")
            .update({ cafe24_apply_status: "applied", applied_at: new Date().toISOString() })
            .eq("product_id", product.id)
            .eq("publish_date", publishDate)
            .eq("price_session", session)
            .eq("formula_version", formulaVersion);
          applied.push({
            ticker: product.ticker,
            productNo: String(product.cafe24_product_no),
            previousWon: String(prevByProduct.get(product.id) ?? "-"),
            appliedWon: String(calc!.priceWon),
            result: "applied",
          });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          await db
            .from("daily_prices")
            .update({ cafe24_apply_status: "failed" })
            .eq("product_id", product.id)
            .eq("publish_date", publishDate)
            .eq("price_session", session)
            .eq("formula_version", formulaVersion);
          applied.push({ ticker: product.ticker, result: "failed", reason: message });
        }
      }
    }

    const someFailed = applied.some((a) => a.result === "failed");
    if (jobId) {
      await db
        .from("job_runs")
        .update({
          status: commit ? (someFailed ? "partially_failed" : "completed") : "calculated",
          finished_at: new Date().toISOString(),
          step_log: { startedAt, collected: rows.length, calculated: calculated.length, applied },
        })
        .eq("id", jobId);
    }

    return Response.json({
      mode: commit ? "committed" : "dry-run",
      publishDate,
      session,
      formulaVersion,
      fx: {
        reference: fxSignal.reference,
        previous: `${fxSignal.previousDate} ${fxSignal.previousRate}`,
        current: `${fxSignal.currentDate} ${fxSignal.currentRate}`,
        declinePct: Number(fxSignal.declinePct.toFixed(4)),
      },
      makjiIndex:
        calculated.length > 0
          ? Number((calculated.reduce((sum, r) => sum + r.calc!.discountPct, 0) / calculated.length).toFixed(2))
          : null,
      products: results.map((r) =>
        r.status === "calculated"
          ? {
              ticker: r.product.ticker,
              name: r.product.name,
              basePriceWon: r.product.base_price_won,
              searchRatio: Number(Math.abs(trends.seriesByProduct[r.product.id][signalDate]).toFixed(2)),
              discountPct: Number(r.calc!.discountPct.toFixed(2)),
              priceWon: r.calc!.priceWon,
            }
          : { ticker: r.product.ticker, name: r.product.name, status: "held", reason: r.reason },
      ),
      cafe24: commit ? applied : "드라이런 — Cafe24 를 호출하지 않았습니다. ?commit=1 로 반영합니다.",
    });
  } catch (cause) {
    return fail("pipeline", cause);
  }
}
