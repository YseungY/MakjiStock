"use client";

import { useMemo, useState } from "react";
import {
  BREADS,
  CAP_TOTAL,
  addDays,
  arrow,
  changeAt,
  cls,
  dirColor,
  fixed,
  fxDropOf,
  isMarketClosed,
  fxLabel,
  linePath,
  seriesAt,
  makjiIndexAt,
  makjiIndexOf,
  predictBreadOf,
  quoteAt,
  signed,
  won,
  ymdOf,
} from "@/lib/bread-market/engine";
import { lockPhaseOf } from "@/lib/bread-market/flow";
import {
  CONSUMER_REWARD_NOTICE,
  SESSION_LABEL,
  lockAppliedPriceWon,
  lockProtection,
} from "@/lib/bread-market/reward-policy";
import { useBreadState, useSession } from "@/lib/bread-market/store";
import { useBreadMarket } from "./context";
import { Photo } from "./sheets";

type Sort = "drop" | "price" | "name";
const SORTS: { id: Sort; label: string }[] = [
  { id: "drop", label: "많이 내린 순" },
  { id: "price", label: "가격 순" },
  { id: "name", label: "이름 순" },
];

/* 막지지수 91일 추이 — 기획안 백테스트 검증 기간과 같은 길이 */
function IndexDash({
  todayKey,
  dataVersion,
  compact = false,
}: {
  todayKey: string;
  dataVersion: number;
  /** 히어로 박스 안에서는 지수 값이 바로 옆에 이미 있어 머리말을 뺀다. */
  compact?: boolean;
}) {
  const { keys, vals } = useMemo(() => {
    /* 시세는 engine 의 모듈 저장소에 있어 이 함수의 인자로 들어오지 않는다.
       dataVersion 을 읽어 두어야 실시세가 주입됐을 때 다시 계산된다. */
    void dataVersion;
    const keys: string[] = [];
    const vals: number[] = [];
    for (let i = 90; i >= 0; i--) {
      const k = addDays(todayKey, -i);
      keys.push(k);
      vals.push(makjiIndexOf(k));
    }
    return { keys, vals };
  }, [todayKey, dataVersion]);
  const W = 300;
  const H = compact ? 58 : 86;
  const P = 4;
  const pt = linePath(vals, W, H, P);
  const last = vals[vals.length - 1];
  const dd = last - vals[0];
  const col = dd < 0 ? "var(--down)" : dd > 0 ? "var(--up)" : "var(--ink-3)";

  const line = (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="막지지수 91일 추이">
      <defs>
        <linearGradient id={compact ? "dashGc" : "dashG"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity=".18" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${pt.d} L${W - P} ${H} L${P} ${H} Z`} fill={`url(#${compact ? "dashGc" : "dashG"})`} />
      <path d={pt.d} fill="none" stroke={col} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pt.lx.toFixed(1)} cy={pt.ly.toFixed(1)} r="2.6" fill={col} />
    </svg>
  );

  if (compact) {
    return (
      <div className="hero-spark">
        <div className="hero-spark__c">{line}</div>
        <div className="hero-spark__x n">
          <span>{ymdOf(keys[0])}</span>
          <span>91일</span>
          <span>{ymdOf(keys[keys.length - 1])}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      <div className="dash__h">
        <span className="dash__t">
          막지지수 추이 <small style={{ color: "var(--ink-3)", fontWeight: 700 }}>91일</small>
        </span>
        <span className="dash__now">
          <b className="n">{fixed(last, 2)}</b>
          <em className={`n ${cls(dd)}`}>{arrow(dd)} {signed(dd, 2)}</em>
        </span>
      </div>
      <div className="dash__body">
        <div className="dash__c">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="막지지수 91일 추이">
            <defs>
              <linearGradient id="dashG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={col} stopOpacity=".18" />
                <stop offset="100%" stopColor={col} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${pt.d} L${W - P} ${H} L${P} ${H} Z`} fill="url(#dashG)" />
            <path d={pt.d} fill="none" stroke={col} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx={pt.lx.toFixed(1)} cy={pt.ly.toFixed(1)} r="2.6" fill={col} />
          </svg>
        </div>
        <div className="dash__y">
          <span className="n">{fixed(pt.hi, 1)}</span>
          <span className="n">{fixed(pt.lo, 1)}</span>
        </div>
      </div>
      <div className="dash__x n">
        <span>{ymdOf(keys[0])}</span>
        <span>{ymdOf(keys[keys.length - 1])}</span>
      </div>
      <div className="dash__f">
        정가를 100으로 둔 다섯 종의 평균 가격 수준입니다. 낮을수록 더 싸게 사는 날이고, 이 기간{" "}
        <b className="n">{fixed(pt.lo, 1)}</b>까지 내려간 적이 있습니다.
      </div>
    </div>
  );
}

const PHASE_TEXT = {
  holding: "지금은 잠근 장이라 현재가와 같아요. 다음 장에 가격이 오르면 잠금가가 적용돼요.",
  expired: "잠금가 구매 시간이 지났어요. 잠금권은 하루 1개라 내일 06:00부터 다시 잠글 수 있어요.",
};

function LockCard({ todayKey }: { todayKey: string }) {
  const { openSheet } = useBreadMarket();
  const my = useBreadState();
  const now = useSession();
  const session = now.session;
  const lock = my.lock;
  const phase = lockPhaseOf(lock, now, todayKey);
  const lockUsed = Boolean(lock && lock.dateKey === todayKey);
  if (!lock || phase === "none" || (phase === "expired" && !lockUsed)) {
    return (
      <div className="lockcard is-empty">
        <b>🔒 오늘의 가격 잠금권 1개 · 둘 중 하나만</b>
        <span>
          ① 오전가 잠금 → 오늘 16:00–23:59에 잠금가로 구매<br />
          ② 오후가 잠금 → 자정~04:59 정가 시간에도 잠금가로 구매 (05시대는 정가 리셋)
        </span>
        {session === "list" ? <span>지금은 정가 시간이라 06:00 오전장부터 잠글 수 있어요.</span> : null}
      </div>
    );
  }
  const b = BREADS.find((x) => x.tk === lock.tk) ?? BREADS[0];
  const nowPrice = quoteAt(b, todayKey, session).price;
  const applied = lockAppliedPriceWon(lock.lockedPrice, nowPrice);
  const protection = lockProtection(lock.session);
  return (
    <button className="lockcard" onClick={() => openSheet({ type: "detail", tk: b.tk })}>
      <span className="lockcard__ph"><Photo bread={b} /></span>
      <span className="lockcard__t">
        <em>🔒 {SESSION_LABEL[lock.session]} 잠금 · {protection?.label}</em>
        <b>{b.name}</b>
        <span className="n">잠금가 {won(lock.lockedPrice)}원 · 현재 {won(nowPrice)}원</span>
        <small>
          {phase === "protecting"
            ? nowPrice > lock.lockedPrice
              ? `지금 ${won(applied)}원에 살 수 있어요 (할인코드로 ${won(nowPrice - lock.lockedPrice)}원 적용)`
              : "현재가가 더 싸요. 현재가로 사면 돼요."
            : phase === "purchased"
              ? `구매 완료 · ${won(lock.purchasePrice ?? applied)}원`
              : PHASE_TEXT[phase]}
        </small>
      </span>
    </button>
  );
}

export function MarketPanel() {
  const { todayKey, openSheet, dataVersion } = useBreadMarket();
  const my = useBreadState();
  const { session } = useSession();
  const [sort, setSort] = useState<Sort>("drop");

  const idxT = makjiIndexAt(todayKey, session);
  /* 직전 확정 지수: 오전장 ← 전날 오후, 오후장 ← 오늘 오전, 정가 시간 ← 오늘 오후 */
  const idxPrev = session === "am" ? makjiIndexAt(addDays(todayKey, -1), "pm") : makjiIndexAt(todayKey, session === "pm" ? "am" : "pm");
  const idxD = idxT - idxPrev;
  const fx = fxDropOf(todayKey);
  const caps = BREADS.filter((b) => quoteAt(b, todayKey, session).total >= CAP_TOTAL - 0.01).length;
  /* 급등주 — 검색지수가 가장 높은 한 종.
     검색 할인 = 검색지수 × 0.145 이므로 검색으로 가장 많이 깎인 상품과 같다. */
  const surge = BREADS.map((b) => ({ b, q: quoteAt(b, todayKey, session) }))
    .sort((x, y) => y.q.searchIdx - x.q.searchIdx)[0];

  const rows = useMemo(() => {
    void dataVersion; // 실시세가 주입되면 가격·등락이 바뀐다
    const arr = BREADS.map((b) => ({ b, q: quoteAt(b, todayKey, session), d: changeAt(b, todayKey, session) }));
    if (sort === "drop") arr.sort((x, y) => x.d.pct - y.d.pct);
    if (sort === "price") arr.sort((x, y) => y.q.price - x.q.price);
    if (sort === "name") arr.sort((x, y) => x.b.name.localeCompare(y.b.name, "ko"));
    return arr;
  }, [sort, todayKey, session, dataVersion]);

  const pb = predictBreadOf(todayKey);
  const pq = quoteAt(pb, todayKey, session);
  const mine = my.preds.find((p) => p.role === "general" && p.dateKey === todayKey);
  const predState = mine ? (!mine.outcome ? "참여 완료" : mine.outcome === "hit" ? "적중 🎯" : mine.outcome === "void" ? "무효" : "아쉬움") : "참여 →";

  return (
    <section className="panel is-on" aria-label="오늘의 빵 마켓">
      <div className="mkthead">
        <div className="mkthead__k"><span aria-hidden="true">🍞</span> 매일 06:00 · 16:00, 새롭게 구워지는 시세</div>
        <h2 className="mkthead__t">맛있는 타이밍,<br /><em>오늘의 빵 마켓</em></h2>
        <div className="mkthead__row">
          <div>
            <span className="mkthead__v n">{fixed(idxT, 2)}</span>
            <span className="mkthead__u">pt</span>
            <div className="mkthead__d">
              <b className="n"><span className={cls(idxD)}>{arrow(idxD)} {signed(idxD, 2)}pt</span></b>
              <span>직전 가격 대비</span>
            </div>
          </div>
          <IndexDash todayKey={todayKey} dataVersion={dataVersion} compact />
        </div>
        <p className="mkthead__note">
          {isMarketClosed(todayKey) ? (
            <>오늘은 <b>휴장</b> · 금요일 확정가를 그대로 보여드려요. 다음 시세는 월요일 06:00에 나옵니다. 정가 100 기준 {BREADS.length}종 평균 가격 수준</>
          ) : (
            <>지금 <b>{SESSION_LABEL[session]}</b> · 정가 100 기준 {BREADS.length}종 평균 가격 수준. 환율 <b className="n">{fxLabel(fx.drop)}</b></>
          )}
          {fx.carried && !isMarketClosed(todayKey) ? <b> (비영업일 이월)</b> : null} · 38%p 상한 도달{" "}
          <b className="n">{caps}종</b>.
        </p>
      </div>

      <div className="sect sect--tight">
        <LockCard todayKey={todayKey} />
      </div>

      <div className="sect sect--tight">
      </div>

      <div className="sortbar">
        <span className="sortbar__l">정렬</span>
        <div className="chiprow" role="group" aria-label="정렬">
          {SORTS.map((s) => (
            <button key={s.id} className={`chip${sort === s.id ? " is-on" : ""}`} aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mktlist">
        {rows.map(({ b, q, d }) => {
          const c = cls(d.pct);
          const col = dirColor(c);
          const p = linePath(seriesAt(b, todayKey, 7, session).map((s) => s.q.price), 54, 26, 3);
          return (
            <button className="quote" key={b.tk} onClick={() => openSheet({ type: "detail", tk: b.tk })}>
              <span className="quote__ph"><Photo bread={b} /></span>
              <span className="quote__nm">
                <b>
                  {b.name}
                  {b.tk === surge.b.tk ? (
                    <em className="surge" title={`검색지수 ${fixed(surge.q.searchIdx, 1)}`}>급등주</em>
                  ) : null}
                </b>
                <span><em>{b.tk}</em> 정가 <s className="n">{won(b.base)}원</s></span>
                <svg className="quote__sp" viewBox="0 0 54 26" preserveAspectRatio="none" aria-hidden="true">
                  <path d={p.d} fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={p.lx.toFixed(1)} cy={p.ly.toFixed(1)} r="2" fill={col} />
                </svg>
              </span>
              <span className="quote__rt">
                <b className="quote__p n">{won(q.price)}원</b>
                <em className={`quote__d n ${c}`} title={`직전 ${won(d.previousPrice)}원 대비 ${signed(d.amount, 0)}원`}>
                  {arrow(d.pct)} {signed(d.pct)}%
                </em>
              </span>
            </button>
          );
        })}
      </div>

      <div className="sect">
        <button className="predcard" onClick={() => openSheet({ type: "predict" })}>
          <div className="predcard__k">TOMORROW&rsquo;S BREAD</div>
          <h3 className="predcard__t">내일 이 빵, 오를까 내릴까</h3>
          <p className="predcard__d">오늘 확정가 기준으로 맞히면 3% 쿠폰. 빵을 사면 내 매수가 기준으로 최대 7%, 틀려도 3%.</p>
          <div className="predcard__b">
            <div>
              <b>{pb.name}</b>
              <span>지금 {won(pq.price)}원 · 내일 06:00 오전가로 판정</span>
            </div>
            <em>{predState}</em>
          </div>
        </button>
      </div>


      <div className="sect">
        <p className="note">
          {CONSUMER_REWARD_NOTICE} 표시 가격은 상품별 검색지수의 14.5%를 쿠폰으로 더하고 환율 변화를 ±28%p 범위로 반영합니다. 최대 38% 할인, 오를 때는 정가의 110%까지입니다.
          오전장 06:00, 오후장 16:00에 가격이 바뀌고 00:00~05:59는 정가입니다. 실제 결제는 막지 자사몰에서 진행됩니다.
        </p>
      </div>
    </section>
  );
}
