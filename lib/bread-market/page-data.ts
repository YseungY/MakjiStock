import { kstHour, kstTodayKey } from "./engine";
import { loadMarketData, type MarketData } from "./market-data";
import { EMPTY_LOCK, loadLock, loadPredictions, type LockData, type ServerPredictionRow } from "./visitor-data";

/* 화면이 첫 렌더에 필요한 것 전부. 페이지 둘이 같은 껍데기를 쓰므로 여기 모은다.

   하나가 실패해도 나머지는 그린다. 시세가 없으면 시드로 돌고, 잠금·예측이
   없으면 없는 대로 보인다 — 아무것도 안 보이는 것보다 낫다. */
export type ShellData = {
  clock: { todayKey: string; hour: number };
  market: MarketData | null;
  lock: LockData;
  predictions: ServerPredictionRow[];
};

export async function loadShellData(): Promise<ShellData> {
  const [market, lock, predictions] = await Promise.all([
    loadMarketData().catch(() => null),
    loadLock().catch(() => EMPTY_LOCK),
    loadPredictions().catch(() => []),
  ]);
  return { clock: { todayKey: kstTodayKey(), hour: kstHour() }, market, lock, predictions };
}
