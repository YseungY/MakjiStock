/* ══════════════════════════════════════════════════════════
   MY 상태 저장소 (비로그인 · 이 브라우저에만 저장) — PRD v0.6
   - 가격 잠금: 하루 1회, 오전가 또는 오후가 중 하나, 빵 한 개
   - 구매(데모): 구매 완료 화면 대신 앱 안에서 구매를 기록하고 구매자 예측으로 연결
   - 예측: 일반(오늘 확정가 대비) · 구매자(내 매수가 대비), 오를지/내릴지
   - 보상: Cafe24 1회용 정액 할인코드 (reward-policy.ts)
   useSyncExternalStore 로 /market 과 /me 가 같은 상태를 봅니다.
   ══════════════════════════════════════════════════════════ */
"use client";

import { useSyncExternalStore } from "react";
import { hash, kstTodayKey } from "./engine";
import { isResetHour, sessionOfHour, type Direction, type Outcome, type Role, type Session } from "./reward-policy";

export type Clock = "live" | Session;

export type PriceLock = {
  tk: string;
  lockedPrice: number;
  session: Session;
  dateKey: string;
  lockedAt: string;
  status: "active" | "purchased";
  purchasePrice?: number;
  lockCode?: { code: string; amount: number };
};

export type Purchase = { id: string; tk: string; price: number; session: Session; dateKey: string; viaLock: boolean };

export type Reward = { ratePct: number; couponPct: number; amount: number; code: string | null; validLabel: string; salePrice: number };

export type Prediction = {
  id: string;
  role: Role;
  tk: string;
  name: string;
  direction: Direction;
  ref: number;
  target: "pm-today" | "am-next";
  targetLabel: string;
  dateKey: string;
  submittedSession: Session;
  submittedAt: string;
  outcome?: Outcome;
  resultPrice?: number;
  reward?: Reward;
};

export type BreadState = {
  clock: Clock;
  lock: PriceLock | null;
  purchases: Purchase[];
  preds: Prediction[];
};

const STORAGE_KEY = "makji-bread-market.my-v2";
const EMPTY: BreadState = { clock: "live", lock: null, purchases: [], preds: [] };

let state: BreadState | null = null;
const listeners = new Set<() => void>();

function load(): BreadState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<BreadState>) };
  } catch {
    return EMPTY;
  }
}

function getSnapshot() {
  if (state === null) state = load();
  return state;
}

function getServerSnapshot() {
  return EMPTY;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function commit(next: BreadState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 사생활 보호 모드 등에서 저장이 막혀도 화면은 계속 동작합니다. */
  }
  listeners.forEach((fn) => fn());
}

export function useBreadState() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function makeCode(prefix: string) {
  return `${prefix}-${String(hash(prefix + Date.now() + Math.random())).slice(0, 4)}-${String(hash(String(Date.now()))).slice(0, 4)}`;
}

/* ───────── 액션 ───────── */
export function setClock(clock: Clock) {
  commit({ ...getSnapshot(), clock });
}

export function lockPrice(lock: Omit<PriceLock, "lockedAt" | "status">) {
  const s = getSnapshot();
  commit({ ...s, lock: { ...lock, lockedAt: new Date().toISOString(), status: "active" } });
}

export function recordPurchase(p: Omit<Purchase, "id">, lockUpdate?: PriceLock) {
  const s = getSnapshot();
  commit({ ...s, lock: lockUpdate ?? s.lock, purchases: [{ ...p, id: makeCode("OD") }, ...s.purchases] });
}

export function addPrediction(p: Omit<Prediction, "id" | "submittedAt">) {
  const s = getSnapshot();
  commit({ ...s, preds: [{ ...p, id: makeCode("PR"), submittedAt: new Date().toISOString() }, ...s.preds] });
}

export function resolvePrediction(id: string, patch: Pick<Prediction, "outcome" | "resultPrice" | "reward">) {
  const s = getSnapshot();
  commit({ ...s, preds: s.preds.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
}

export function resetBreadState() {
  commit({ ...EMPTY, clock: getSnapshot().clock });
}

/* ───────── 오늘 날짜·시각 (KST) ─────────
   서버 렌더 시점엔 null → 브라우저에서 확정. 정적 빌드 날짜로 고정되는 것을 막습니다. */
function subscribeMinute(fn: () => void) {
  const t = window.setInterval(fn, 60000);
  return () => window.clearInterval(t);
}

export function useTodayKey() {
  return useSyncExternalStore(subscribeMinute, kstTodayKey, () => null);
}

function kstHour() {
  return new Date(Date.now() + 9 * 3600000).getUTCHours();
}

function useKstHour() {
  return useSyncExternalStore(subscribeMinute, kstHour, () => 10);
}

/** 현재 가격 세션. 데모 시각을 고르면 그 세션으로 덮어씁니다. */
export function useSession() {
  const { clock } = useBreadState();
  const hour = useKstHour();
  const h = clock === "live" ? hour : clock === "am" ? 10 : clock === "pm" ? 18 : 1;
  /* 데모 시각은 날짜를 바꾸지 않으므로 '정가 시간'을 오후 잠금의 다음 날 새벽으로 간주합니다. */
  return { session: sessionOfHour(h), reset: clock === "live" && isResetHour(h), demo: clock !== "live" };
}
