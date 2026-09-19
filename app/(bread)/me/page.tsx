import type { Metadata } from "next";
import { kstHour, kstTodayKey } from "@/lib/bread-market/engine";
import { loadMarketData, type MarketData } from "@/lib/bread-market/market-data";
import { BreadMarketShell } from "@/components/bread-market/Shell";
import { MyPanel } from "@/components/bread-market/MyPanel";

/* 시세를 서버에서 받아 첫 HTML 에 실어 보낸다. 클라이언트에서 받으면 그때까지
   시드 값이 화면에 떠 있다 — 예전 가격이 잠깐 보이던 게 그거다. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MY | MAKJI STOCK",
  description: "비로그인 브라우저 기준 가격 잠금 · 예측 · 할인코드",
};

export default async function MePage() {
  /* Supabase 가 안 되면 화면은 시드로 돈다. 시세가 없다고 페이지까지
     죽이지는 않는다 — 아무것도 안 보이는 것보다 낫다. */
  let market: MarketData | null = null;
  try {
    market = await loadMarketData();
  } catch {
    market = null;
  }

  return (
    <BreadMarketShell clock={{ todayKey: kstTodayKey(), hour: kstHour() }} market={market}>
      <MyPanel />
    </BreadMarketShell>
  );
}
