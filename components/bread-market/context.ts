"use client";

import { createContext, useContext } from "react";

export type SheetState =
  | { type: "detail"; tk: string }
  | { type: "locked-detail"; tk: string }
  | { type: "predict" }
  | { type: "lock"; tk: string }
  | null;

export type ServerPrediction = {
  id: string;
  direction: "up" | "down";
  reference_price_won: number;
  target_publish_date: string;
  target_session: "am" | "pm";
  result: "pending" | "hit" | "miss" | "void";
  result_price_won: number | null;
  reward_rate_pct: number;
  products: { ticker: string; name: string } | null;
  reward: { code: string; amountWon: number | null; validUntil: string | null } | null;
};

export type BreadMarketCtx = {
  todayKey: string;
  /* 예측은 서버가 정본이다. Shell 이 한 번 받아 내려보낸다.
     화면마다 따로 받으면 요청이 늘고 상태가 갈라진다. */
  predictions: ServerPrediction[];
  refreshPredictions: () => void;
  openSheet: (s: SheetState) => void;
  toast: (icon: string, title: string, desc?: string) => void;
};

export const BreadMarketContext = createContext<BreadMarketCtx | null>(null);

export function useBreadMarket() {
  const ctx = useContext(BreadMarketContext);
  if (!ctx) throw new Error("useBreadMarket must be used inside <BreadMarketShell>");
  return ctx;
}
