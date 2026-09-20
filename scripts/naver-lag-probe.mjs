/* 네이버 데이터랩이 전날(D-1) 검색지수를 몇 시에 올리는지 잰다.

   오전가 크론은 05:30 KST 에 돌고 06:00 에 공개한다. 그 시각 D-1 지수가 아직
   없으면 이월값밖에 없어 가격을 만들지 못한다(route.ts 가 보류한다). 언제부터
   안전한지는 문서에 없어서 직접 재는 수밖에 없다.

   사용:
     node scripts/naver-lag-probe.mjs                 # 한 번 재고 로그에 붙인다
     node scripts/naver-lag-probe.mjs --all           # 활성 상품 전부
     node scripts/naver-lag-probe.mjs --out other.tsv

   며칠 모으려면 crontab 에 새벽~오전만 촘촘히 걸면 된다. 예)
     *\/15 4-10 * * *  cd <repo> && node scripts/naver-lag-probe.mjs >> /dev/null

   로그(naver-lag.tsv) 열: 잰시각KST · 대상D-1 · 도착여부 · 실제마지막관측일 · 지연분 · 티커 */
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnvFile } from "../lib/pricing/env.mjs";
import { fetchTrendsSeparately } from "../lib/pricing/naver.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const ALL = process.argv.includes("--all");
const OUT = path.resolve(arg("out", "naver-lag.tsv"));

/** KST 벽시계. 로그가 사람이 읽는 시각이어야 언제부터 안전한지 눈에 보인다. */
function kstNow() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
}
function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

for (const file of [".env.local", ".env"]) {
  // Next.js 와 같은 우선순위. loadEnvFile 은 먼저 넣은 값을 지킨다.
  await loadEnvFile(path.resolve(file)).catch(() => {});
}

const supabase = async (query) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
};

const now = kstNow();
const today = now.slice(0, 10);
const want = addDays(today, -1); // 크론이 필요로 하는 D-1

const products = await supabase("products?select=id,ticker,keywords&active=eq.true&order=ticker");
const targets = ALL ? products : products.slice(0, 1);
if (targets.length === 0) throw new Error("활성 상품이 없습니다.");

const { seriesByProduct } = await fetchTrendsSeparately({
  products: targets.map((p) => ({ id: p.id, ticker: p.ticker, keywords: p.keywords })),
  // 관측이 드문 키워드도 이월 대상을 찾을 수 있게 넉넉히 본다.
  startDate: addDays(want, -30),
  endDate: want,
  log: () => {},
});

const lines = [];
for (const p of targets) {
  const days = Object.keys(seriesByProduct[p.id] ?? {}).sort();
  const last = days.at(-1) ?? "";
  const arrived = last === want;
  // 도착했으면 자정 이후 몇 분 만인지. 크론(05:30)과 견주는 숫자다.
  const minutes = Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16));
  lines.push([now, want, arrived ? "도착" : "미도착", last, minutes, p.ticker].join("\t"));
}

await appendFile(OUT, lines.join("\n") + "\n");
for (const line of lines) console.log(line);

/* 모인 뒤 훑어보기: 날짜별로 "미도착 마지막 시각"과 "도착 첫 시각"을 뽑는다. */
if (process.argv.includes("--summary")) {
  const rows = (await readFile(OUT, "utf8")).trim().split("\n").map((l) => l.split("\t"));
  const byDay = new Map();
  for (const [at, target, state] of rows) {
    const day = at.slice(0, 10);
    const bucket = byDay.get(day) ?? { day, target, lastMissing: null, firstArrived: null };
    if (state === "미도착") bucket.lastMissing = at.slice(11, 16);
    else if (!bucket.firstArrived) bucket.firstArrived = at.slice(11, 16);
    byDay.set(day, bucket);
  }
  console.log("\n잰 날짜\tD-1\t마지막 미도착\t첫 도착");
  for (const b of byDay.values()) {
    console.log(`${b.day}\t${b.target}\t${b.lastMissing ?? "-"}\t${b.firstArrived ?? "아직"}`);
  }
}
