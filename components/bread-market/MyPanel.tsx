"use client";

import { BREADS, breadOf, quoteAt, won } from "@/lib/bread-market/engine";
import { lockPhaseOf } from "@/lib/bread-market/flow";
import { CONSUMER_REWARD_NOTICE, SESSION_LABEL, lockProtection } from "@/lib/bread-market/reward-policy";
import { useEffect, useState } from "react";
import { resetBreadState, useBreadState, useSession } from "@/lib/bread-market/store";
import { useBreadMarket } from "./context";
import { DemoClock } from "./MarketPanel";
import { Photo, PredictionResult } from "./sheets";

/* MY: 비로그인 · 이 브라우저 기준. 가격 잠금 → 구매 → 예측 → 할인코드 순서로 보여줍니다. */
type ServerLock = {
  lock: { locked_price_won: number; lock_code_amount_won: number | null } | null;
  discountCode: string | null;
  validUntil: string | null;
};

/* 잠금 차액 할인코드는 이메일로 보내지 않고 MY 에서 바로 보여준다.
   비로그인이라 visitor_token 쿠키가 본인 확인을 대신한다. */
function useLockCode(): ServerLock {
  const [state, setState] = useState<ServerLock>({ lock: null, discountCode: null, validUntil: null });
  useEffect(() => {
    let alive = true;
    fetch("/api/locks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerLock | null) => {
        if (alive && data) setState(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function MyPanel() {
  const { todayKey, openSheet } = useBreadMarket();
  const server = useLockCode();
  const my = useBreadState();
  const now = useSession();
  const session = now.session;
  const codes = my.preds.filter((p) => p.reward?.code).length + (my.lock?.lockCode ? 1 : 0);
  const activity = my.preds.length + my.purchases.length + (my.lock ? 1 : 0);
  const lead = activity === 0 ? "시작해볼까요" : codes > 0 ? "할인코드 도착" : "기록 중";
  const lock = my.lock;
  const phase = lockPhaseOf(lock, now, todayKey);
  const lockBread = lock ? breadOf(lock.tk) : null;

  return (
    <section className="panel is-on" aria-label="MY">
      <div className="myhead">
        <div className="myhead__k">MY MAKJI</div>
        <h2 className="myhead__t">오늘도 한 조각,<br /><em>{lead}</em></h2>
        <div className="myhead__st">
          <div className="mystat"><b className="n">{my.preds.length}</b><span>예측 참여</span></div>
          <div className="mystat"><b className="n">{codes}</b><span>할인코드</span></div>
        </div>
      </div>

      <div className="sect">
        <div className="sect__h"><h3 className="sect__t">오늘의 가격 잠금</h3></div>
        <div className="mylist">
          {lock && lockBread ? (
            <div className="myrow">
              <div className="myrow__i myrow__i--ph"><Photo bread={lockBread} /></div>
              <div className="myrow__t">
                <b>{lockBread.name}</b>
                <span>
                  {SESSION_LABEL[lock.session]} 잠금 {won(lock.lockedPrice)}원 · {lockProtection(lock.session)?.label} 사용
                  {server.discountCode ? (
                    <>
                      <br />잠금가 할인코드 <b className="n">{server.discountCode}</b>
                      {server.lock?.lock_code_amount_won ? ` · ${won(server.lock.lock_code_amount_won)}원 할인` : null}
                      <br />주문서에 입력하면 잠금가로 결제됩니다.
                    </>
                  ) : null}
                </span>
              </div>
              <div className="myrow__v">
                <b className={phase === "protecting" ? "down" : "flat"}>
                  {phase === "holding" ? "보관 중" : phase === "protecting" ? "사용 가능" : phase === "purchased" ? "구매 완료" : "종료"}
                </b>
                <span>현재 {won(quoteAt(lockBread, todayKey, session).price)}원</span>
              </div>
            </div>
          ) : (
            <div className="empty">
              <i aria-hidden="true">🔒</i>
              <b>오늘 잠근 빵이 없어요</b>
              <span>하루 한 번, 오전가 또는 오후가 중 하나를<br />빵 한 개에 잠가둘 수 있어요</span>
              <br />
              <button className="empty__cta" onClick={() => openSheet({ type: "detail", tk: BREADS[0].tk })}>빵 고르러 가기</button>
            </div>
          )}
        </div>
      </div>

      <div className="sect">
        <div className="sect__h"><h3 className="sect__t">예측과 할인코드</h3></div>
        <div className="mylist">
          {my.preds.length === 0 ? (
            <div className="empty">
              <i aria-hidden="true">🧭</i>
              <b>아직 예측 기록이 없어요</b>
              <span>누구나 적중 3%, 구매자는 적중 7% · 틀려도 3%<br />쿠폰은 1회용 할인코드로 드려요</span>
              <br />
              <button className="empty__cta" onClick={() => openSheet({ type: "predict" })}>내일 가격 예측하기</button>
            </div>
          ) : (
            my.preds.map((p) => {
              const b = breadOf(p.tk);
              return (
                <div className="myrow myrow--stack" key={p.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="myrow__i myrow__i--ph"><Photo bread={b} /></div>
                    <div className="myrow__t">
                      <b>{p.name} · {p.direction === "up" ? "오른다" : "내린다"}</b>
                      <span>{p.role === "buyer" ? "구매자 · 내 매수가" : "일반 · 오늘 확정가"} {won(p.ref)}원 기준 · {p.targetLabel}</span>
                    </div>
                  </div>
                  <PredictionResult id={p.id} compact />
                </div>
              );
            })
          )}
        </div>
        <p className="note" style={{ marginTop: 10 }}>{CONSUMER_REWARD_NOTICE} 할인코드는 카페24 주문서에 입력하며 비회원 주문에도 쓸 수 있어요.</p>
      </div>


      <DemoClock />

      <footer className="footer">
        <span className="blogo" role="img" aria-label="막지" />
        <div className="footer__sns">
          {["makji_official", "makjibakery"].map((h) => (
            <a className="snsb" key={h} href={`https://www.instagram.com/${h}/`} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
                <circle cx="12" cy="12" r="4.2" />
                <circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
              </svg>
              @{h}
            </a>
          ))}
        </div>
        <p className="footer__t">
          <b>MAKJI STOCK</b> · 빵값연구소 프로토타입 v1.1<br />
          비로그인 · 이 브라우저 기준 기록입니다. 쿠키를 지우면 기록이 사라져요.<br />
          시세·검색지수·환율은 데모용 시드 데이터이며, 실제 주문과 결제는 막지 자사몰에서 진행됩니다.
        </p>
        {activity > 0 ? (
          <button className="footer__reset" onClick={resetBreadState}>데모 기록 초기화</button>
        ) : null}
      </footer>
    </section>
  );
}
