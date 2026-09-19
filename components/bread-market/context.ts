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
  openSheet: (s: SheetState) => void;
  toast: (icon: string, title: string, desc?: string) => void;
};

export const BreadMarketContext = createContext<BreadMarketCtx | null>(null);

export function useBreadMarket() {
  const ctx = useContext(BreadMarketContext);
  if (!ctx) throw new Error("useBreadMarket must be used inside <BreadMarketShell>");
  return ctx;
}
