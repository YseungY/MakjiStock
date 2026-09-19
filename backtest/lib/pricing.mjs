import { addDays } from "./dates.mjs";

export function roundTo(value, unit) {
  return Math.round(value / unit) * unit;
}

export function buildFxSignals(ratesByDate, signalDates) {
  const published = Object.entries(ratesByDate)
    .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(
    signalDates.map((signalDate) => {
      const available = published.filter(([date]) => date <= signalDate);
      if (available.length < 2) return [signalDate, null];
      const [previousDate, previousRate] = available.at(-2);
      const [currentDate, currentRate] = available.at(-1);
      return [
        signalDate,
        {
          previousDate,
          previousRate,
          currentDate,
          currentRate,
          declinePct: ((previousRate - currentRate) / previousRate) * 100,
          carriedForward: currentDate !== signalDate,
        },
      ];
    }),
  );
}

function validRates(ratesByDate) {
  return Object.entries(ratesByDate)
    .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

function latestRatesBefore(entries, cutoffDate, count) {
  return entries.filter(([date]) => date <= cutoffDate).slice(-count);
}

export function buildSessionFxSignals({ closesByDate, opensByDate, publishDates }) {
  const closes = validRates(closesByDate);
  return Object.fromEntries(
    publishDates.map((publishDate) => {
      const previousCalendarDate = addDays(publishDate, -1);
      const recentCloses = latestRatesBefore(closes, previousCalendarDate, 2);
      const morning = recentCloses.length < 2
        ? null
        : {
            reference: "PREVIOUS_CLOSE_TO_CLOSE",
            previousDate: recentCloses[0][0],
            previousRate: recentCloses[0][1],
            currentDate: recentCloses[1][0],
            currentRate: recentCloses[1][1],
            declinePct:
              ((recentCloses[0][1] - recentCloses[1][1]) / recentCloses[0][1]) * 100,
            carriedForward: recentCloses[1][0] !== previousCalendarDate,
          };

      const latestClose = recentCloses.at(-1);
      const openRate = opensByDate[publishDate];
      const afternoon = !latestClose || !Number.isFinite(openRate) || openRate <= 0
        ? null
        : {
            reference: "PREVIOUS_CLOSE_TO_TODAY_OPEN",
            previousDate: latestClose[0],
            previousRate: latestClose[1],
            currentDate: publishDate,
            currentRate: openRate,
            declinePct: ((latestClose[1] - openRate) / latestClose[1]) * 100,
            carriedForward: false,
          };

      return [publishDate, { morning, afternoon }];
    }),
  );
}

export function calculateDay({ searchRatio, fxDeclinePct, basePriceWon, pricing }) {
  const searchCouponPct = searchRatio * pricing.searchWeight;
  const fxRawAdjustmentPct = fxDeclinePct * pricing.fxWeight * pricing.fxScale;
  const fxAdjustmentPct = Math.max(
    -pricing.fxSurchargeCapPct,
    Math.min(pricing.fxDiscountCapPct, fxRawAdjustmentPct),
  );
  const rawDiscountPct = searchCouponPct + fxAdjustmentPct;
  const discountPct = Math.max(
    pricing.discountFloorPct ?? -Infinity,
    Math.min(pricing.discountCapPct, rawDiscountPct),
  );
  const priceWon = roundTo(
    basePriceWon * (1 - discountPct / 100),
    pricing.priceRoundingWon,
  );
  return {
    searchCouponPct,
    fxRawAdjustmentPct,
    fxAdjustmentPct,
    rawDiscountPct,
    discountPct,
    priceWon,
  };
}

export function simulateProduct({ product, pricing, signalDates, trends, fxSignals }) {
  let previousPriceWon = null;
  return signalDates.map((signalDate) => {
    const searchRatio = trends[signalDate];
    const fx = fxSignals[signalDate];
    if (!Number.isFinite(searchRatio) || !fx) {
      return {
        signalDate,
        publishDate: addDays(signalDate, 1),
        productId: product.id,
        ticker: product.ticker,
        productName: product.name,
        status: previousPriceWon === null ? "unavailable" : "held",
        reason: !Number.isFinite(searchRatio) ? "missing-search" : "missing-fx",
        basePriceWon: product.basePriceWon,
        priceWon: previousPriceWon,
        previousPriceWon,
        priceChangePct: previousPriceWon === null ? null : 0,
      };
    }
    const calculated = calculateDay({
      searchRatio,
      fxDeclinePct: fx.declinePct,
      basePriceWon: product.basePriceWon,
      pricing,
    });
    const priceChangePct =
      previousPriceWon === null
        ? null
        : ((calculated.priceWon - previousPriceWon) / previousPriceWon) * 100;
    const row = {
      signalDate,
      publishDate: addDays(signalDate, 1),
      productId: product.id,
      ticker: product.ticker,
      productName: product.name,
      status: "calculated",
      basePriceWon: product.basePriceWon,
      searchRatio,
      fxRateDate: fx.currentDate,
      fxRate: fx.currentRate,
      fxDeclinePct: fx.declinePct,
      fxCarriedForward: fx.carriedForward,
      ...calculated,
      previousPriceWon,
      priceChangePct,
    };
    previousPriceWon = calculated.priceWon;
    return row;
  });
}

export function simulateProductSessions({
  product,
  pricing,
  publishDates,
  trends,
  fxSignals,
}) {
  let previousPriceWon = null;
  const rows = [];

  for (const publishDate of publishDates) {
    const searchSignalDate = addDays(publishDate, -1);
    const searchRatio = trends[searchSignalDate];
    const previousSearchRatio = trends[addDays(searchSignalDate, -1)];
    const searchChangePoint =
      Number.isFinite(searchRatio) && Number.isFinite(previousSearchRatio)
        ? searchRatio - previousSearchRatio
        : null;
    const sessions = [
      { priceSession: "MORNING_0600", publishTimeKst: "06:00", fx: fxSignals[publishDate]?.morning },
      { priceSession: "AFTERNOON_1600", publishTimeKst: "16:00", fx: fxSignals[publishDate]?.afternoon },
    ];

    for (const session of sessions) {
      const missingSearch = !Number.isFinite(searchRatio);
      const missingFx = !session.fx;
      if (missingSearch || missingFx) {
        const reason = missingSearch
          ? "missing-search"
          : session.priceSession === "AFTERNOON_1600"
            ? "missing-today-open"
            : "missing-previous-closes";
        rows.push({
          publishDate,
          publishTimeKst: session.publishTimeKst,
          priceSession: session.priceSession,
          searchSignalDate,
          signalDate: searchSignalDate,
          productId: product.id,
          ticker: product.ticker,
          productName: product.name,
          status: previousPriceWon === null ? "unavailable" : "held",
          reason,
          basePriceWon: product.basePriceWon,
          searchRatio: Number.isFinite(searchRatio) ? searchRatio : null,
          previousSearchRatio: Number.isFinite(previousSearchRatio)
            ? previousSearchRatio
            : null,
          searchChangePoint,
          priceWon: previousPriceWon,
          previousPriceWon,
          priceChangePct: previousPriceWon === null ? null : 0,
        });
        continue;
      }

      const calculated = calculateDay({
        searchRatio,
        fxDeclinePct: session.fx.declinePct,
        basePriceWon: product.basePriceWon,
        pricing,
      });
      const priceChangePct = previousPriceWon === null
        ? null
        : ((calculated.priceWon - previousPriceWon) / previousPriceWon) * 100;
      rows.push({
        publishDate,
        publishTimeKst: session.publishTimeKst,
        priceSession: session.priceSession,
        searchSignalDate,
        signalDate: searchSignalDate,
        productId: product.id,
        ticker: product.ticker,
        productName: product.name,
        status: "calculated",
        basePriceWon: product.basePriceWon,
        searchRatio,
        previousSearchRatio,
        searchChangePoint,
        fxReference: session.fx.reference,
        fxPreviousDate: session.fx.previousDate,
        fxPreviousRate: session.fx.previousRate,
        fxRateDate: session.fx.currentDate,
        fxRate: session.fx.currentRate,
        fxDeclinePct: session.fx.declinePct,
        fxCarriedForward: session.fx.carriedForward,
        ...calculated,
        previousPriceWon,
        priceChangePct,
      });
      previousPriceWon = calculated.priceWon;
    }
  }

  return rows;
}
