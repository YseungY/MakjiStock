"use client";

import { useEffect, useRef, useState } from "react";
import {
  SHOP_URL,
  breadOf,
  changeAt,
  cls,
  dirColor,
  discCls,
  discTxt,
  fixed,
  fxLabel,
  linePath,
  predictBreadOf,
  quoteAt,
  series,
  shortOf,
  signed,
  won,
  type Bread,
} from "@/lib/bread-market/engine";
import { lockPhaseOf, resolveDemo, targetOf } from "@/lib/bread-market/flow";
import {
  CONSUMER_REWARD_NOTICE,
  REWARD_RATE_PCT,
  SESSION_LABEL,
  lockAppliedPriceWon,
  lockCodeAmountWon,
  lockProtection,
  rewardMessage,
  type Direction,
  type Role,
} from "@/lib/bread-market/reward-policy";
import {
  addPrediction,
  lockPrice,
  makeCode,
  recordPurchase,
  resolvePrediction,
  useBreadState,
  useSession,
} from "@/lib/bread-market/store";
import { useBreadMarket } from "./context";

/* ───────── 공통: 상품 사진 ───────── */
export function Photo({ bread }: { bread: Bread }) {
  return (
    <span
      role="img"
      aria-label={bread.name}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        background: `url(${bread.photo}) center/cover no-repeat`,
      }}
    />
  );
}

/* ───────── 공통: 바텀시트 ───────── */
function Sheet({
  title,
  onClose,
  foot,
  hero,
  children,
}: {
  title: string;
  onClose: () => void;
  foot?: React.ReactNode;
  hero?: Bread;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  /* 열릴 때 한 번만 닫기 버튼에 포커스 (입력 중 포커스를 뺏지 않도록 마운트 시점에만) */
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet is-on">
      <button className="sheet__veil" onClick={onClose} aria-label="닫기" tabIndex={-1} />
      <div className="sheet__in" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grab"><i /></div>
        <div className="sheet__bar">
          <h3 className="sheet__ttl">{title}</h3>
          <button className="sheet__x" onClick={onClose} aria-label="닫기" ref={closeRef}>✕</button>
        </div>
        <div className="sheet__body">
          {hero ? <div className="sheet__hero"><Photo bread={hero} /></div> : null}
          {children}
        </div>
        {foot ? <div className="sheet__foot">{foot}</div> : null}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   상품 상세 (원본 openDetail) — 큰 사진 · 세션 가격 · 잠금/구매
   ══════════════════════════════════════════ */
export function DetailSheet({ tk, onClose }: { tk: string; onClose: () => void }) {
  const { todayKey, openSheet, toast } = useBreadMarket();
  const my = useBreadState();
  const now = useSession();
  const session = now.session;
  const b = breadOf(tk);
  const q = quoteAt(b, todayKey, session);
  const ch = changeAt(b, todayKey, session);
  const ser = series(b, todayKey, 0, 14);
  const p = linePath(ser.map((s) => s.q.price), 300, 96, 6);
  const col = dirColor(cls(q.vsBase));
  /* 환율만 반영했을 때의 가격. 판매가와 같은 10원 반올림을 쓴다. */
  const fxOnlyPriceWon = Math.round((b.base * (1 - q.fxDisc / 100)) / 10) * 10;
  const gid = `g${b.tk}`;

  const lock = my.lock;
  const phase = lockPhaseOf(lock, now, todayKey);
  const lockUsed = Boolean(lock && lock.dateKey === todayKey);
  const lockBlocked = lockUsed ? "오늘 잠금 사용 완료" : session === "list" ? "잠금은 06:00부터" : null;
  const lockHere = lock && lock.tk === b.tk && phase === "protecting";

  function buy() {
    let price = q.price;
    let lockUpdate = undefined;
    if (lockHere && lock) {
      price = lockAppliedPriceWon(lock.lockedPrice, q.price);
      const amount = lockCodeAmountWon(lock.lockedPrice, q.price);
      lockUpdate = { ...lock, status: "purchased" as const, purchasePrice: price, lockCode: amount > 0 ? { code: makeCode("LK"), amount } : undefined };
    }
    recordPurchase({ tk: b.tk, price, session, dateKey: todayKey, viaLock: Boolean(lockHere) }, lockUpdate);
    toast("🧾", `${won(price)}원에 구매했어요 (데모)`, lockHere ? "잠금가를 할인코드로 적용했어요" : "내 매수가 기준으로 예측해보세요");
    openSheet({ type: "buyer", tk: b.tk, ref: price });
  }

  const foot = (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn--ghost btn--sm" style={{ flex: 1 }} disabled={Boolean(lockBlocked)} onClick={() => openSheet({ type: "lock", tk: b.tk })}>
          {lockBlocked ?? `${SESSION_LABEL[session]} 가격 잠금`}
        </button>
        <button className="btn btn--sm" style={{ flex: 1.4 }} onClick={buy}>
          {lockHere && lock ? `잠금가 ${won(lockAppliedPriceWon(lock.lockedPrice, q.price))}원 구매` : "구매하고 예측하기"}
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 11, fontWeight: 700 }}>
        <a href={SHOP_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-3)" }}>막지 자사몰 상품 보기 →</a>
      </div>
    </div>
  );

  return (
    <Sheet title={b.name} onClose={onClose} foot={foot} hero={b}>
      <div className="detail__nm" style={{ marginBottom: 10 }}>
        <b>{b.name}</b>
        <span>{b.tk} · {b.full}</span>
      </div>
      <div className="detail__pr">
        <span className="detail__now n">{won(q.price)}원</span>
        <span className="detail__base n">{won(b.base)}원</span>
      </div>
      <div className="detail__sub">
        <span className={cls(q.vsBase)}>{SESSION_LABEL[session]} · 정가 대비 {signed(q.vsBase)}%</span>
        {" · "}
        <span className={cls(ch.pct)}>
          직전가 대비 {ch.amount > 0 ? "+" : ch.amount < 0 ? "−" : ""}{won(Math.abs(ch.amount))}원 ({signed(ch.pct)}%)
        </span>
      </div>

      <div className="chart">
        <div className="chart__h">
          <b>최근 14일 오전가 추이</b>
          <span className="n">{won(p.lo)} ~ {won(p.hi)}원</span>
        </div>
        <svg viewBox="0 0 300 96" preserveAspectRatio="none" role="img" aria-label={`${b.name} 최근 14일 가격 추이`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={col} stopOpacity=".2" />
              <stop offset="100%" stopColor={col} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${p.d} L300 96 L0 96 Z`} fill={`url(#${gid})`} />
          <path d={p.d} fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={p.lx.toFixed(1)} cy={p.ly.toFixed(1)} r="3.6" fill={col} />
        </svg>
        <div className="chart__x n">
          <span>{shortOf(ser[0].key)}</span>
          <span>{shortOf(ser[7].key)}</span>
          <span>오늘</span>
        </div>
      </div>

      {/* 정가 → 환율 반영 → 검색 할인까지 적용한 최종가.
          퍼센트만 보여주면 얼마가 깎였는지 와닿지 않는다. 단계마다 금액을 찍는다. */}
      <div className="calc">
        <div className="calc__step">
          <span className="calc__step-l">정가</span>
          <b className="n calc__step-p is-struck">{won(b.base)}원</b>
        </div>
        <div className="calc__step">
          <span className="calc__step-l">
            <i className="calc__k" style={{ background: "#3C7CB8" }} />환율 반영{" "}
            <small className={discCls(q.fxDisc)}>{discTxt(q.fxDisc)}</small>
            <small style={{ color: "var(--ink-3)" }}> · {session === "list" ? "정가 시간" : fxLabel(q.fxDrop)}</small>
          </span>
          <b className="n calc__step-p is-struck">{won(fxOnlyPriceWon)}원</b>
        </div>
        <div className="calc__step is-final">
          <span className="calc__step-l">
            <i className="calc__k" style={{ background: "#BE9540" }} />검색 할인{" "}
            <small className={discCls(q.searchDisc)}>{discTxt(q.searchDisc)}</small>
            <small style={{ color: "var(--ink-3)" }}> · 검색지수 {fixed(q.searchIdx, 1)}</small>
          </span>
          <b className="n calc__step-p">{won(q.price)}원</b>
        </div>
        <div className="calc__r is-total">
          <span>최종 <small style={{ fontWeight: 600, color: "var(--ink-3)" }}>할인 38%까지 · 오르면 정가의 110%까지</small></span>
          <b className={`n ${discCls(q.total)}`}>{discTxt(q.total)}</b>
        </div>
      </div>
    </Sheet>
  );
}

/* ══════════════════════════════════════════
   가격 잠금 — 하루 1회 · 오전가 또는 오후가 · 빵 한 개
   ══════════════════════════════════════════ */
export function LockSheet({ tk, onClose }: { tk: string; onClose: () => void }) {
  const { todayKey, toast } = useBreadMarket();
  const { session } = useSession();
  const b = breadOf(tk);
  const q = quoteAt(b, todayKey, session);
  const protection = lockProtection(session);

  const [pending, setPending] = useState(false);

  /* 잠금은 서버가 확정한다. 하루 1회 제한을 브라우저에서 막으면 쿠키만 지워도
     뚫린다. 잠금가도 서버가 daily_prices 에서 읽는다 — 값을 보내게 하면
     원하는 가격에 잠글 수 있다.
     localStorage 는 서버가 받아준 뒤에만 따라 쓴다. */
  async function confirm() {
    if (!protection || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: b.tk }),
      });
      const payload = await response.json();
      if (!response.ok) {
        toast("⚠️", "잠금하지 못했어요", payload.error ?? "잠시 후 다시 시도해주세요");
        return;
      }
      const lockedPrice = payload.lock.locked_price_won as number;
      lockPrice({ tk: b.tk, lockedPrice, session, dateKey: todayKey });
      toast("🔒", `${b.name} ${won(lockedPrice)}원 잠금`, `${protection.label} 잠금가로 살 수 있어요`);
      onClose();
    } catch {
      toast("⚠️", "잠금하지 못했어요", "네트워크 상태를 확인해주세요");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet title="가격 잠금" onClose={onClose} hero={b}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div className="eyebrow">{SESSION_LABEL[session]} 가격</div>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.045em" }}>{b.name}</div>
        <div className="n" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.05em", marginTop: 4 }}>{won(q.price)}원</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 700, marginTop: 3 }}>
          {protection ? `${protection.label} 이 가격으로 구매` : "정가 시간에는 잠글 수 없어요"}
        </div>
      </div>
      <div className="calc" style={{ marginTop: 0 }}>
        <div className="calc__r"><span>① 가격 잠금은 하루 한 번 사용할 수 있어요.</span></div>
        <div className="calc__r"><span>② 오전 가격 또는 오후 가격 중 하나를 선택해 잠가두세요.</span></div>
        <div className="calc__r"><span>③ 빵 한 개만 잠금 가능해요.</span></div>
      </div>
      <p className="note" style={{ textAlign: "center", margin: "12px 0 14px" }}>
        {session === "am"
          ? "16:00 오후가가 잠금가보다 오르면 잠금가로, 내려가면 더 싼 오후가로 사면 돼요."
          : "자정 이후 정가 시간(00:00~04:59)에도 잠금가로 살 수 있어요. 05시대는 정가 리셋 시간이에요."}
        <br />잠금가는 주문서에 입력하는 1회용 할인코드로 적용돼요.
      </p>
      <button className="btn btn--blue" disabled={!protection || pending} onClick={confirm}>{pending ? "잠그는 중…" : "이 가격 잠그기"}</button>
    </Sheet>
  );
}

/* ══════════════════════════════════════════
   가격 예측 — 일반: 오늘 확정가 대비 / 구매자: 내 매수가 대비
   ══════════════════════════════════════════ */
export function PredictSheet({ kind: role, tk, refPrice, onClose }: { kind: Role; tk?: string; refPrice?: number; onClose: () => void }) {
  const { todayKey, toast } = useBreadMarket();
  const my = useBreadState();
  const { session } = useSession();
  const [voting, setVoting] = useState<Direction | null>(null);
  const b = role === "buyer" && tk ? breadOf(tk) : predictBreadOf(todayKey);
  const q = quoteAt(b, todayKey, session);
  const ref = role === "buyer" && refPrice !== undefined ? refPrice : q.price;
  const { target, targetLabel } = targetOf(role, session);
  const mine =
    role === "general"
      ? my.preds.find((p) => p.role === "general" && p.dateKey === todayKey)
      : my.preds.find((p) => p.role === "buyer" && p.tk === b.tk && p.ref === ref && p.dateKey === todayKey);
  const rate = REWARD_RATE_PCT[role];

  /* 예측도 서버가 확정한다. 한 회차 1회 제한과 기준가를 브라우저가 정하면
     쿠키만 지워도 뚫리고, 원하는 기준가로 참여할 수 있다.
     구매자 예측은 1차 출시 범위 밖이라 아직 로컬에만 남긴다. */
  async function vote(direction: Direction) {
    if (voting) return;
    setVoting(direction);
    try {
      if (role === "general") {
        const response = await fetch("/api/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: b.tk, direction }),
        });
        const payload = await response.json();
        if (!response.ok) {
          toast("⚠️", "예측하지 못했어요", payload.error ?? "잠시 후 다시 시도해주세요");
          return;
        }
        addPrediction({
          role,
          tk: b.tk,
          name: b.name,
          direction,
          ref: payload.entry.reference_price_won,
          target,
          targetLabel: payload.targetLabel ?? targetLabel,
          dateKey: todayKey,
          submittedSession: session,
        });
        toast("🧭", "예측 참여 완료", `${payload.targetLabel ?? targetLabel}로 판정해요`);
        return;
      }
      addPrediction({ role, tk: b.tk, name: b.name, direction, ref, target, targetLabel, dateKey: todayKey, submittedSession: session });
      toast("🧭", "예측 참여 완료", `${targetLabel}로 판정해요`);
    } catch {
      toast("⚠️", "예측하지 못했어요", "네트워크 상태를 확인해주세요");
    } finally {
      setVoting(null);
    }
  }

  /* 1) 참여 전 */
  if (!mine || voting) {
    return (
      <Sheet title={role === "buyer" ? "구매자 가격 예측" : "내일 가격 예측"} onClose={onClose} hero={b}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div className="eyebrow">{role === "buyer" ? "내가 산 빵" : "오늘의 예측 종목"}</div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.045em" }}>{b.name}</div>
          <div className="n" style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 700, marginTop: 5 }}>
            {role === "buyer" ? "내 매수가" : "오늘 확정가"} {won(ref)}원 기준
          </div>
        </div>
        <p className="lead" style={{ textAlign: "center", fontSize: 16 }}>
          {targetLabel}, 오를까요 내릴까요?
          <small>{role === "buyer" ? `맞히면 최대 ${rate.hit}%, 틀려도 최대 ${rate.miss}% 쿠폰` : `맞히면 최대 ${rate.hit}% 쿠폰 · 참여는 하루 한 번`}</small>
        </p>
        <div className="vote">
          {(["up", "down"] as const).map((v) => (
            <button
              key={v}
              className={`voteb ${v}${voting === v ? " is-on" : voting ? " is-off" : ""}`}
              onClick={() => vote(v)}
              aria-pressed={voting === v}
            >
              <i aria-hidden="true">{v === "up" ? "▲" : "▼"}</i>
              <b>{v === "up" ? "오른다" : "내린다"}</b>
              <span>{v === "up" ? `${won(ref)}원보다 비싸진다` : `${won(ref)}원보다 싸진다`}</span>
            </button>
          ))}
        </div>
        <p className="note" style={{ textAlign: "center" }}>
          쿠폰은 결과가 나온 시점의 판매가 기준 1회용 할인코드로 드려요. 가격이 같으면 예측은 무효이고 모두 3% 쿠폰을 받아요. 가입 없이 참여할 수 있어요.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title={role === "buyer" ? "구매자 가격 예측" : "내일 가격 예측"} onClose={onClose} hero={b}>
      <PredictionResult id={mine.id} />
    </Sheet>
  );
}

/** 예측 한 건의 대기·결과·할인코드 카드 (시트와 MY에서 함께 사용) */
export function PredictionResult({ id, compact = false }: { id: string; compact?: boolean }) {
  const my = useBreadState();
  const p = my.preds.find((x) => x.id === id);
  if (!p) return null;
  const b = breadOf(p.tk);
  const chosen = p.direction === "up" ? "오른다" : "내린다";

  if (!p.outcome || p.resultPrice === undefined || !p.reward) {
    return (
      <div>
        {compact ? null : (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div className="eyebrow">내 예측</div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.045em" }}>{b.name} · {chosen}</div>
            <div className="n" style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 700, marginTop: 4 }}>
              {p.role === "buyer" ? "내 매수가" : "오늘 확정가"} {won(p.ref)}원 기준 · {p.targetLabel} 판정
            </div>
          </div>
        )}
        <button className="btn btn--ghost" onClick={() => resolvePrediction(p.id, resolveDemo(p, makeCode))}>결과 미리보기 (데모)</button>
      </div>
    );
  }

  const msg = rewardMessage(p.role, p.outcome, p.ref, p.resultPrice);
  const diff = p.resultPrice - p.ref;
  const tone = p.outcome === "hit" ? "ok" : p.outcome === "void" ? "warn" : "dup";
  return (
    <div>
      <div className={`verdict ${tone}`}>
        <div className="verdict__t">{msg.title}</div>
        <p className="verdict__d">
          {p.targetLabel} <b className="n">{won(p.resultPrice)}원</b> · 기준가 대비{" "}
          <b className={`n ${cls(diff)}`}>{diff > 0 ? "+" : diff < 0 ? "−" : ""}{won(Math.abs(diff))}원</b> · 내 선택 {chosen}
        </p>
      </div>
      {p.reward.code ? (
        <div className="coupon">
          <div className="coupon__k">{msg.badge} · 오늘 판매가 기준 {fixed(p.reward.couponPct, p.reward.couponPct % 1 ? 1 : 0)}% 쿠폰</div>
          <div className="coupon__v n">{won(p.reward.amount)}<small>원</small></div>
          <p className="coupon__c">{b.name} 전용 · 1회 사용 · {p.reward.validLabel}</p>
          <p className="coupon__x">판매가 {won(p.reward.salePrice)}원 기준 · 비회원도 주문서 할인코드 칸에 입력</p>
          <div className="coupon__code n">{p.reward.code}</div>
        </div>
      ) : (
        <p className="note" style={{ textAlign: "center" }}>이번에는 쿠폰이 없어요. 내일 또 기회가 있어요.</p>
      )}
      {compact ? null : <p className="note" style={{ textAlign: "center", marginTop: 10 }}>{CONSUMER_REWARD_NOTICE}</p>}
    </div>
  );
}
