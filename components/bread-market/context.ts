"use client";

import { createContext, useContext } from "react";

export type SheetState =
  | { type: "detail"; tk: string }
  | { type: "predict" }
  | { type: "buyer"; tk: string; ref: number }
  | { type: "lock"; tk: string }
  | null;

export type BreadMarketCtx = {
  todayKey: string;
  /* 실시세가 주입될 때마다 올라간다. 시세를 memo 하는 곳은 반드시 의존성에
     넣어야 한다 — 넣지 않으면 하이드레이션 후에도 시드 값이 남는다. */
  dataVersion: number;
  openSheet: (s: SheetState) => void;
  toast: (icon: string, title: string, desc?: string) => void;
};

export const BreadMarketContext = createContext<BreadMarketCtx | null>(null);

export function useBreadMarket() {
  const ctx = useContext(BreadMarketContext);
  if (!ctx) throw new Error("useBreadMarket must be used inside <BreadMarketShell>");
  return ctx;
}
