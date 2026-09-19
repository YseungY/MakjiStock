import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function loadEnvFile(envPath) {
  try {
    const contents = await readFile(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function envProductNo(productId) {
  return process.env[`CAFE24_PRODUCT_NO_${productId.toUpperCase()}`];
}

async function cafe24Request({ mallId, accessToken, method, pathname, body }) {
  const response = await fetch(`https://${mallId}.cafe24api.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Cafe24 ${method} ${pathname} ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) throw new Error("--input <simulation.json>이 필요합니다.");

  await loadEnvFile(path.resolve(args["env-file"] ?? ".env"));
  const report = JSON.parse(await readFile(path.resolve(args.input), "utf8"));
  // 빈 문자열은 ?? 를 통과해 Number("")=0 이 된다. || 로 1 로 떨어뜨린다.
  const shopNo = Number(args["shop-no"] || process.env.CAFE24_SHOP_NO) || 1;
  const priceField = args["price-field"] ?? "price";
  const commit = args.commit === true;

  const updates = report.products.map((product) => {
    const latest = [...product.rows]
      .reverse()
      .find((row) => row.status === "calculated" && Number.isFinite(row.priceWon));
    return {
      productId: product.id,
      name: product.name,
      productNo: product.cafe24ProductNo ?? envProductNo(product.id),
      priceWon: latest?.priceWon,
      publishDate: latest?.publishDate,
    };
  });

  const invalid = updates.filter(
    (update) => !update.productNo || !Number.isFinite(update.priceWon),
  );
  console.table(updates);
  if (invalid.length > 0) {
    throw new Error(
      `Cafe24 상품번호 또는 계산 가격이 없습니다: ${invalid.map((item) => item.productId).join(", ")}`,
    );
  }
  if (!commit) {
    console.log("드라이런 완료. 실제 반영은 --commit을 추가해야 합니다.");
    return;
  }

  const mallId = process.env.CAFE24_MALL_ID;
  const accessToken = process.env.CAFE24_ACCESS_TOKEN;
  if (!mallId || !accessToken) {
    throw new Error("CAFE24_MALL_ID와 CAFE24_ACCESS_TOKEN이 필요합니다.");
  }

  for (const update of updates) {
    const pathname = `/api/v2/admin/products/${update.productNo}?shop_no=${shopNo}`;
    const before = await cafe24Request({
      mallId,
      accessToken,
      method: "GET",
      pathname: `${pathname}&fields=product_no,product_name,price,price_excluding_tax`,
    });
    const current = before.product?.[priceField];
    if (Number(current) === update.priceWon) {
      console.log(`${update.name}: 이미 ${update.priceWon}원, 건너뜀`);
      continue;
    }
    await cafe24Request({
      mallId,
      accessToken,
      method: "PUT",
      pathname,
      body: {
        shop_no: shopNo,
        request: { [priceField]: String(update.priceWon) },
      },
    });
    console.log(`${update.name}: ${current}원 → ${update.priceWon}원`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
