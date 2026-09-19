import type { Metadata } from "next";
import { BreadMarketShell } from "../../../components/bread-market/Shell";
import { MarketPanel } from "../../../components/bread-market/MarketPanel";

export const metadata: Metadata = {
  title: "마켓 | MAKJI STOCK",
  description: "막지 빵 시세 · 가격 잠금 · 내일 가격 예측",
};

export default function MarketPage() {
  return (
    <BreadMarketShell>
      <MarketPanel />
    </BreadMarketShell>
  );
}
