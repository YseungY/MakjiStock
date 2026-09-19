import type { Metadata } from "next";
import { BreadMarketShell } from "../../../components/bread-market/Shell";
import { MyPanel } from "../../../components/bread-market/MyPanel";

export const metadata: Metadata = {
  title: "MY | MAKJI STOCK",
  description: "비로그인 브라우저 기준 가격 잠금 · 예측 · 할인코드",
};

export default function MePage() {
  return (
    <BreadMarketShell>
      <MyPanel />
    </BreadMarketShell>
  );
}
