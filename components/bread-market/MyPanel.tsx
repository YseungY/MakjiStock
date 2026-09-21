"use client";

import { breadOf, quoteAt, won } from "@/lib/bread-market/engine";
import { lockPhaseOf } from "@/lib/bread-market/flow";
import {
  CONSUMER_REWARD_NOTICE,
  INSTANT_REWARD_MAX_PCT,
  INSTANT_REWARD_MIN_PCT,
  SESSION_LABEL,
  lockProtection,
} from "@/lib/bread-market/reward-policy";
import Link from "next/link";
import { resetBreadState, useBreadState, useSession } from "@/lib/bread-market/store";
import { useBreadMarket } from "./context";
import { Photo } from "./sheets";

/* MY: 비로그인 · 이 브라우저 기준. 가격 잠금 → 구매 → 예측 → 할인코드 순서로 보여줍니다.
   잠금·예측·할인코드는 서버가 첫 HTML 에 이미 실어 보낸다(page-data.ts).
   여기서 다시 받아오지 않는다 — 그러면 "기록 없음"을 먼저 그렸다가 덮어쓴다. */

const RESULT_LABEL: Record<string, { title: string; tone: string }> = {
  pending: { title: "판정 대기", tone: "flat" },
  hit: { title: "적중", tone: "down" },
  miss: { title: "미적중", tone: "flat" },
  void: { title: "무효 · 가격 동일", tone: "flat" },
};

/* 할인쿠폰 — 코드와 보상만 담는다. 발급 이유는 쿠폰 밖 본문에 쓴다. */
function CouponCode({ code, note }: { code: string; note?: string }) {
  const { toast } = useBreadMarket();
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast("✓", "쿠폰번호를 복사했어요", "자사몰 로그인 후 쿠폰번호를 등록해주세요");
    } catch {
      toast("⚠️", "복사하지 못했어요", "쿠폰번호를 길게 눌러 직접 복사해주세요");
    }
  }
  return (
    <button type="button" className="coupon" onClick={copy} aria-label={`할인코드 ${code} 복사`}>
      <span className="coupon__code n">{code}</span>
      {note ? <span className="coupon__r">{note}</span> : null}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="12" height="12" rx="2.5" />
        <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      </svg>
    </button>
  );
}

export function MyPanel() {
  const { todayKey, openSheet, predictions: preds, lock: server, instantRewards } = useBreadMarket();

  const my = useBreadState();
  const now = useSession();
  const session = now.session;
  /* 지금 뭔가 할 게 남은 것만 남긴다 — 결과를 기다리는 예측과 아직 쓸 수 있는
     할인코드. 유효기간이 지난 코드는 서버가 code 를 비워 내려주고(visitor-data.ts),
     그 줄은 여기서 통째로 사라진다. 다 지나가면 빈 상태로 돌아간다. */
  const live = preds.filter((p) => p.result === "pending" || p.reward?.code);
  const codes = live.filter((p) => p.reward?.code).length + (server.discountCode ? 1 : 0) + instantRewards.length;
  /* 잠금은 서버가 정본이다. localStorage 는 서버 응답이 오기 전에만 쓴다.
     브라우저 기록을 지워도 쿠키가 남아 서버에는 잠금이 그대로 있다.
     로컬만 보면 "잠근 빵이 없어요"라고 해놓고 다시 잠글 때 409 가 난다. */
  const lock = server.lock
    ? {
        tk: server.lock.products?.ticker ?? "",
        lockedPrice: server.lock.locked_price_won,
        session: server.lock.lock_session,
        dateKey: todayKey,
        status: server.lock.status === "purchased" ? ("purchased" as const) : ("active" as const),
        lockedAt: "",
      }
    : my.lock;
  const phase = lockPhaseOf(lock, now, todayKey);
  const lockBread = lock?.tk ? breadOf(lock.tk) : null;
  const activity = live.length + (lock ? 1 : 0) + instantRewards.length;
  const lead = activity === 0 ? "시작해볼까요" : codes > 0 ? "할인코드 도착" : "기록 중";

  return (
    <section className="panel is-on" aria-label="MY">
      <div className="myhead">
        <div className="myhead__k">MY MAKJI</div>
        <h2 className="myhead__t">오늘도 한 조각,<br /><em>{lead}</em></h2>
        <div className="myhead__st">
          <div className="mystat"><b className="n">{live.length}</b><span>예측 참여</span></div>
          <div className="mystat"><b className="n">{codes}</b><span>할인코드</span></div>
        </div>
      </div>

      <div className="sect">
        <div className="sect__h"><h3 className="sect__t">오늘의 가격 잠금</h3></div>
        <div className="mylist">
          {lock && lockBread ? (
            <div className={`myrow${server.discountCode ? " myrow--stack" : ""}`}>
              <div className="myrow__top">
                <div className="myrow__i myrow__i--ph"><Photo bread={lockBread} /></div>
                <div className="myrow__t">
                  <b>{lockBread.name}</b>
                  <span>
                    {SESSION_LABEL[lock.session]} 잠금 {won(lock.lockedPrice)}원 · {lockProtection(lock.session)?.label} 사용
                  </span>
                </div>
                <div className="myrow__v">
                  <b className={phase === "protecting" ? "down" : "flat"}>
                    {phase === "holding" ? "보관 중" : phase === "protecting" ? "사용 가능" : phase === "purchased" ? "구매 완료" : "종료"}
                  </b>
                  <span>현재 {won(quoteAt(lockBread, todayKey, session).price)}원</span>
                </div>
              </div>
              {server.discountCode ? (
                <>
                  <CouponCode
                    code={server.discountCode}
                    note={server.lock?.lock_code_amount_won ? `${won(server.lock.lock_code_amount_won)}원 차액` : undefined}
                  />
                  <p className="myrow__why">
                    오후가가 올라 차액만큼 쿠폰이 발급됐어요 · 새벽 01:59까지<br />
                    막지 자사몰 가입 후 쿠폰번호를 등록하면 잠금가로 살 수 있어요.
                  </p>
                </>
              ) : null}
            </div>
          ) : (
            <div className="empty">
              <i aria-hidden="true">🔒</i>
              <b>오늘 잠근 빵이 없어요</b>
              <span>하루 한 번, 오전장(06:00–15:59)에<br />빵 한 개의 가격을 잠가둘 수 있어요</span>
              <br />
              {/* 첫 상품 상세를 여는 건 이상하다. 목록에서 직접 고르게 보낸다. */}
              <Link className="empty__cta" href="/market#mktlist">빵 고르러 가기</Link>
            </div>
          )}
        </div>
      </div>

      <div className="sect">
        <div className="sect__h"><h3 className="sect__t">예측과 할인코드</h3></div>
        <div className="mylist">
          {/* 바로 받기 쿠폰. 예측이 아니라 회차에 묶여 있어 목록과 출처가 다르다. */}
          {instantRewards.map((r) => (
            <div className="myrow myrow--stack" key={r.roundId}>
              <div className="myrow__top">
                <div className="myrow__t">
                  <b>바로 받기 · {r.ratePct}% 할인코드</b>
                  <span>오늘 예측 대신 받았어요</span>
                </div>
              </div>
              <CouponCode code={r.code} note={r.amountWon ? `${won(r.amountWon)}원` : undefined} />
            </div>
          ))}
          {live.length === 0 && instantRewards.length === 0 ? (
            <div className="empty">
              <i aria-hidden="true">🧭</i>
              <b>아직 예측 기록이 없어요</b>
              <span>안정형은 {INSTANT_REWARD_MIN_PCT}~{INSTANT_REWARD_MAX_PCT}% 확정<br />공격형은 맞히면 더 크게</span>
              <br />
              <button className="empty__cta" onClick={() => openSheet({ type: "predict" })}>내일 가격 예측하기</button>
            </div>
          ) : (
            live.map((p) => {
              const b = p.products?.ticker ? breadOf(p.products.ticker) : null;
              const label = RESULT_LABEL[p.result] ?? RESULT_LABEL.pending;
              const diff = p.result_price_won !== null ? p.result_price_won - p.reference_price_won : null;
              return (
                <div className="myrow myrow--stack" key={p.id}>
                  <div className="myrow__top">
                    {b ? <div className="myrow__i myrow__i--ph"><Photo bread={b} /></div> : null}
                    <div className="myrow__t">
                      <b>{p.products?.name ?? ""} · {p.direction === "up" ? "오른다" : "내린다"}</b>
                      <span>
                        {p.target_publish_date} {p.target_session === "am" ? "오전가" : "오후가"}로 판정
                      </span>
                    </div>
                    <div className="myrow__v">
                      <b className={label.tone}>{label.title}</b>
                    </div>
                  </div>
                  {p.reward?.code ? (
                    <CouponCode
                      code={p.reward.code}
                      note={p.reward_rate_pct > 0 ? `${p.reward_rate_pct}% 보상` : undefined}
                    />
                  ) : null}
                  <p className="myrow__why">
                    기준가 {won(p.reference_price_won)}원
                    {diff !== null ? (
                      <>
                        {" · "}결과 {won(p.result_price_won!)}원 · 기준가 대비{" "}
                        {diff > 0 ? "+" : diff < 0 ? "−" : ""}{won(Math.abs(diff))}원
                      </>
                    ) : null}
                  </p>
                </div>
              );
            })
          )}
        </div>
        <p className="note" style={{ marginTop: 10 }}>{CONSUMER_REWARD_NOTICE} 막지 자사몰 가입 후 쿠폰번호를 등록해야 주문에 적용돼요. 한 주문에는 할인코드를 하나만 쓸 수 있어요 — 여러 개라면 금액이 큰 코드를 쓰세요.</p>
      </div>


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
          <b>MAKJI STOCK</b><br />
          비로그인 · 이 브라우저 기준 기록입니다. 쿠키를 지우면 기록이 사라져요.<br />
          시세는 네이버 검색 트렌드와 한국은행 원/달러 환율로 매일 06:00·16:00에 다시 계산합니다.<br />실제 주문과 결제는 막지 자사몰에서 진행됩니다.
        </p>
        {activity > 0 ? (
          <button className="footer__reset" onClick={resetBreadState}>이 브라우저 기록 지우기</button>
        ) : null}
      </footer>
    </section>
  );
}
