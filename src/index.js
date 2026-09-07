// ============================================================================
// Robinhood Detective — Cloudflare Worker
// Data source: DexScreener public API (no RPC, no factory log scanning)
// Channel: Robinhood Chain Inspector 🕵️‍♂️
// ============================================================================
// Cloudflare bindings/env expected (unchanged from the previous version):
//   env.BOT_STATE            KV namespace
//   env.TELEGRAM_BOT_TOKEN   secret
//   env.TELEGRAM_CHANNEL_ID  secret
//   env.DRY_RUN              "true"/"false" (defaults to "true")
// Cron Trigger: keep your existing schedule (e.g. every 1 minute / 3 minutes).
// ============================================================================

const DEXSCREENER_BASE = "https://api.dexscreener.com";
const CHAIN_ID = "robinhood";
const EXPLORER_BASE = "https://robinhoodchain.blockscout.com/address";
const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
// Add more addresses here if you learn the contract address for QQQ or other Robinhood Chain quote assets.
const ANCHOR_TOKENS = [WETH_ADDRESS];
const IGNORED_PAIRS = new Set(["USDG/WETH"]);

const MAX_ADDRESSES_PER_CALL = 30;
const MAX_SUBREQUESTS_PER_RUN = 45; // Cloudflare Workers subrequest ceiling headroom
const ALERT_SUBREQUEST_RESERVE = 5; // keep room for Telegram sends after data fetching

const CONFIG = {
  MAX_ALERTS_PER_HOUR: 40,
  THRESHOLDS: {
    LIQUIDITY_PCT: 0.3,
    LIQUIDITY_MIN_USD_MOVE: 2500,
    VOLUME_MULTIPLIER: 3,
    VOLUME_MIN_USD: 250,
    PRICE_PCT_5M: 25,
    PRICE_PCT_1H: 60,
    IMBALANCE_RATIO: 10, // 10:1
    IMBALANCE_MIN_TXNS: 10,
    FDV_TIERS: [50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000],
    DEAD_LIQUIDITY_MIN_PEAK_TO_TRACK: 500, // only track "peak" once a pool had real liquidity
    DEAD_LIQUIDITY_PCT_OF_PEAK: 0.1, // below 10% of peak
    DEAD_LIQUIDITY_MIN_USD: 200, // or below this absolute floor
    MIN_LIQUIDITY_TO_TRACK: 5000,
  },
  COOLDOWN_MINUTES: {
    LIQUIDITY_SPIKE: 20,
    LIQUIDITY_DRAIN: 20,
    VOLUME_SURGE: 15,
    PRICE_MOVE: 20,
    IMBALANCE: 15,
  },
  VOLUME_HISTORY_SAMPLES: 10, // 10 samples x 3min cron = ~30min trailing baseline
};

let subrequestCount = 0;
let subrequestReserve = 0;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trackSubrequest() {
  if (subrequestCount >= MAX_SUBREQUESTS_PER_RUN - subrequestReserve) {
    throw new Error("SUBREQUEST_BUDGET_REACHED");
  }
  subrequestCount++;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function fetchJson(url, { retries = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    trackSubrequest();
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; RobinhoodDetectiveBot/1.0)",
        },
      });
      if (res.status === 429) {
        lastError = new Error("DexScreener rate limit hit");
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        break;
      }
      if (!res.ok) throw new Error(`DexScreener HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.message === "SUBREQUEST_BUDGET_REACHED") throw err;
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError || new Error(`DexScreener request failed: ${url}`);
}

function timeAgo(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function fmtUsd(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "N/A";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 2 })}`;
}

function fmtPrice(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "N/A";
  return n < 0.01 ? `$${n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}` : `$${n.toFixed(4)}`;
}

function escapeMd(text) {
  if (text === null || text === undefined) return text;
  return String(text).replace(/([_*[\]`])/g, "\\$1");
}

function isIgnoredPair(pair) {
  const symbols = [pair.baseToken?.symbol, pair.quoteToken?.symbol]
    .filter(Boolean)
    .map((symbol) => String(symbol).toUpperCase())
    .sort();
  return symbols.length === 2 && IGNORED_PAIRS.has(symbols.join("/"));
}

// ---------------------------------------------------------------------------
// DexScreener API calls
// ---------------------------------------------------------------------------

async function fetchLatestBoosts() {
  const data = await fetchJson(`${DEXSCREENER_BASE}/token-boosts/latest/v1`);
  return Array.isArray(data) ? data : [];
}

// Fetches all Robinhood Chain pairs for a batch of token addresses (max 30 per call).
async function fetchPairsForTokenBatch(tokenAddresses) {
  if (tokenAddresses.length === 0) return [];
  const url = `${DEXSCREENER_BASE}/latest/dex/tokens/${tokenAddresses.join(",")}`;
  const data = await fetchJson(url);
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  return pairs.filter((p) => p.chainId === CHAIN_ID);
}

async function fetchAllChainPairs() {
  const seen = new Map();
  for (const anchor of ANCHOR_TOKENS) {
    try {
      const pairs = await fetchPairsForTokenBatch([anchor]);
      for (const pair of pairs) seen.set(pair.pairAddress.toLowerCase(), pair);
    } catch (err) {
      if (err.message === "SUBREQUEST_BUDGET_REACHED") throw err;
      console.error(`Anchor discovery failed for ${anchor}:`, err.message);
    }
  }
  return [...seen.values()].filter(
    (pair) =>
      !isIgnoredPair(pair) &&
      (pair.liquidity?.usd ?? 0) >= CONFIG.THRESHOLDS.MIN_LIQUIDITY_TO_TRACK
  );
}

// Handles >30 addresses by chunking, and stops gracefully if the subrequest budget runs out.
async function fetchPairsForTokens(tokenAddresses) {
  const results = [];
  for (const chunk of chunkArray(tokenAddresses, MAX_ADDRESSES_PER_CALL)) {
    try {
      const pairs = await fetchPairsForTokenBatch(chunk);
      results.push(...pairs);
    } catch (err) {
      if (err.message === "SUBREQUEST_BUDGET_REACHED") break;
      console.error("fetchPairsForTokens chunk failed:", err.message);
    }
  }
  return results;
}

function pickPrimaryPair(pairs) {
  if (pairs.length === 0) return null;
  return pairs.reduce((best, p) => {
    const liq = p.liquidity?.usd ?? 0;
    const bestLiq = best?.liquidity?.usd ?? -1;
    return liq > bestLiq ? p : best;
  }, null);
}

function getSubjectToken(pair) {
  const anchorSet = new Set(ANCHOR_TOKENS.map((anchor) => anchor.toLowerCase()));
  const baseAddr = pair.baseToken?.address?.toLowerCase();
  const quoteAddr = pair.quoteToken?.address?.toLowerCase();

  if (baseAddr && !anchorSet.has(baseAddr)) {
    return {
      symbol: pair.baseToken?.symbol ?? "?",
      name: pair.baseToken?.name ?? "Unknown token",
      address: pair.baseToken?.address,
      otherSymbol: pair.quoteToken?.symbol ?? "?",
    };
  }
  if (quoteAddr && !anchorSet.has(quoteAddr)) {
    return {
      symbol: pair.quoteToken?.symbol ?? "?",
      name: pair.quoteToken?.name ?? "Unknown token",
      address: pair.quoteToken?.address,
      otherSymbol: pair.baseToken?.symbol ?? "?",
    };
  }
  return {
    symbol: pair.baseToken?.symbol ?? "?",
    name: pair.baseToken?.name ?? "Unknown token",
    address: pair.baseToken?.address,
    otherSymbol: pair.quoteToken?.symbol ?? "?",
  };
}

// ---------------------------------------------------------------------------
// KV state helpers
// ---------------------------------------------------------------------------

async function getAllPairStates(env) {
  const raw = await env.BOT_STATE.get("pairStates");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveAllPairStates(env, states) {
  await env.BOT_STATE.put("pairStates", JSON.stringify(states));
}

async function isKnown(env, key) {
  return (await env.BOT_STATE.get(key)) !== null;
}

async function markKnown(env, key, ttlSeconds) {
  await env.BOT_STATE.put(key, "1", ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
}

async function isOnCooldown(env, alertKind, pairAddress) {
  return (await env.BOT_STATE.get(`cooldown:${alertKind}:${pairAddress.toLowerCase()}`)) !== null;
}

async function startCooldown(env, alertKind, pairAddress, minutes) {
  await env.BOT_STATE.put(`cooldown:${alertKind}:${pairAddress.toLowerCase()}`, "1", {
    expirationTtl: minutes * 60,
  });
}

async function isUnderHourlyCap(env) {
  const countStr = await env.BOT_STATE.get("hourlyAlertCount");
  const count = countStr ? Number.parseInt(countStr, 10) : 0;
  return Number.isSafeInteger(count) && count < CONFIG.MAX_ALERTS_PER_HOUR;
}

async function incrementHourlyCap(env) {
  const countStr = await env.BOT_STATE.get("hourlyAlertCount");
  const count = countStr ? Number.parseInt(countStr, 10) : 0;
  const next = Number.isSafeInteger(count) && count >= 0 ? count + 1 : 1;
  await env.BOT_STATE.put("hourlyAlertCount", next.toString(), { expirationTtl: 60 * 60 });
}

// ---------------------------------------------------------------------------
// Feature 6 — Newly boosted tokens (via token-boosts/latest/v1)
// ---------------------------------------------------------------------------

async function discoverBoosts(env, polledAt) {
  const alerts = [];
  let boosts;
  try {
    boosts = await fetchLatestBoosts();
  } catch (err) {
    console.error("Boost discovery failed:", err.message);
    return alerts;
  }

  const chainBoosts = boosts.filter((b) => b.chainId === CHAIN_ID);
  const unseen = [];
  for (const b of chainBoosts) {
    if (!(await isKnown(env, `knownBoost:${b.tokenAddress.toLowerCase()}`))) unseen.push(b);
  }
  if (unseen.length === 0) return alerts;

  let pairs;
  try {
    pairs = await fetchPairsForTokens(unseen.map((b) => b.tokenAddress));
  } catch (err) {
    console.error("Fetching pairs for boosted tokens failed:", err.message);
    pairs = [];
  }

  for (const boost of unseen) {
    await markKnown(env, `knownBoost:${boost.tokenAddress.toLowerCase()}`, 30 * 24 * 60 * 60);
    const tokenPairs = pairs.filter(
      (p) =>
        !isIgnoredPair(p) &&
        p.baseToken?.address?.toLowerCase() === boost.tokenAddress.toLowerCase()
    );
    const primary = pickPrimaryPair(tokenPairs);
    if (!primary) continue; // boosted but no live pair on this chain yet
    alerts.push({ kind: "BOOSTED", pair: primary, boost, polledAt });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Snapshot + per-pair evaluation (Features 2, 3, 4, 5, 7, 8)
// ---------------------------------------------------------------------------

function snapshotFromPair(pair, polledAt, prevState) {
  const liquidityUsd = pair.liquidity?.usd ?? null;
  const volumeM5 = pair.volume?.m5 ?? 0;
  const volumeHistory = prevState?.volumeHistory ? [...prevState.volumeHistory] : [];
  volumeHistory.push(volumeM5);
  while (volumeHistory.length > CONFIG.VOLUME_HISTORY_SAMPLES) volumeHistory.shift();

  const priorPeak = prevState?.peakLiquidityUsd ?? 0;
  const peakLiquidityUsd =
    liquidityUsd !== null && liquidityUsd >= CONFIG.THRESHOLDS.DEAD_LIQUIDITY_MIN_PEAK_TO_TRACK
      ? Math.max(priorPeak, liquidityUsd)
      : priorPeak;
  const capValue = pair.marketCap ?? pair.fdv ?? null;
  const initialFdvTier = capValue === null
    ? 0
    : CONFIG.THRESHOLDS.FDV_TIERS.reduce(
        (tier, threshold) => (capValue >= threshold ? threshold : tier),
        0
      );
  const subject = getSubjectToken(pair);

  return {
    symbol: subject.symbol,
    name: subject.name,
    tokenAddress: subject.address,
    dexId: pair.dexId,
    url: pair.url,
    liquidityUsd,
    volumeHistory,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
    peakLiquidityUsd,
    lastFdvTier: prevState?.lastFdvTier ?? initialFdvTier,
    isDead: prevState?.isDead ?? false,
    polledAt,
  };
}

function evaluatePair(pair, prevState, polledAt) {
  const alerts = [];
  const pairAddress = pair.pairAddress;
  const liquidityUsd = pair.liquidity?.usd ?? null;

  // --- Feature 2: Liquidity spike / drain ---
  if (prevState && prevState.liquidityUsd && liquidityUsd !== null && prevState.liquidityUsd > 0) {
    const pctChange = (liquidityUsd - prevState.liquidityUsd) / prevState.liquidityUsd;
    const absMove = Math.abs(liquidityUsd - prevState.liquidityUsd);
    if (Math.abs(pctChange) >= CONFIG.THRESHOLDS.LIQUIDITY_PCT && absMove >= CONFIG.THRESHOLDS.LIQUIDITY_MIN_USD_MOVE) {
      alerts.push({
        kind: pctChange > 0 ? "LIQUIDITY_SPIKE" : "LIQUIDITY_DRAIN",
        pair,
        prevLiquidityUsd: prevState.liquidityUsd,
        pctChange,
        polledAt,
      });
    }
  }

  // --- Feature 3: Volume surge ---
  if (prevState && prevState.volumeHistory && prevState.volumeHistory.length >= 2) {
    const baseline =
      prevState.volumeHistory.reduce((a, b) => a + b, 0) / prevState.volumeHistory.length;
    const volumeM5 = pair.volume?.m5 ?? 0;
    if (baseline > 0 && volumeM5 >= baseline * CONFIG.THRESHOLDS.VOLUME_MULTIPLIER && volumeM5 >= CONFIG.THRESHOLDS.VOLUME_MIN_USD) {
      alerts.push({
        kind: "VOLUME_SURGE",
        pair,
        baseline,
        multiplier: volumeM5 / baseline,
        polledAt,
      });
    }
  }

  // --- Feature 4: Price move (DexScreener already computes these windows) ---
  const change5m = pair.priceChange?.m5;
  const change1h = pair.priceChange?.h1;
  if (typeof change5m === "number" && Math.abs(change5m) >= CONFIG.THRESHOLDS.PRICE_PCT_5M) {
    alerts.push({ kind: change5m > 0 ? "PRICE_PUMP" : "PRICE_DUMP", pair, pct: change5m, window: "5 min", polledAt });
  } else if (typeof change1h === "number" && Math.abs(change1h) >= CONFIG.THRESHOLDS.PRICE_PCT_1H) {
    alerts.push({ kind: change1h > 0 ? "PRICE_PUMP" : "PRICE_DUMP", pair, pct: change1h, window: "1h", polledAt });
  }

  // --- Feature 5: Buy/sell imbalance ---
  const buys = pair.txns?.m5?.buys ?? 0;
  const sells = pair.txns?.m5?.sells ?? 0;
  const totalTxns = buys + sells;
  if (totalTxns >= CONFIG.THRESHOLDS.IMBALANCE_MIN_TXNS) {
    if (buys >= sells * CONFIG.THRESHOLDS.IMBALANCE_RATIO) {
      alerts.push({ kind: "IMBALANCE_BUY", pair, buys, sells, polledAt });
    } else if (sells >= buys * CONFIG.THRESHOLDS.IMBALANCE_RATIO) {
      alerts.push({ kind: "IMBALANCE_SELL", pair, buys, sells, polledAt });
    }
  }

  // --- Feature 7: FDV / market cap milestone ---
  const capValue = pair.marketCap ?? pair.fdv ?? null;
  const lastTier = prevState?.lastFdvTier ?? 0;
  let newTier = lastTier;
  if (capValue !== null) {
    for (const tier of CONFIG.THRESHOLDS.FDV_TIERS) {
      if (capValue >= tier && tier > lastTier) newTier = tier;
    }
    if (newTier > lastTier) {
      alerts.push({ kind: "MILESTONE", pair, tier: newTier, fdv: pair.fdv, marketCap: pair.marketCap, polledAt });
    }
  }

  // --- Feature 8: Dead / rugged tracker ---
  const peak = prevState?.peakLiquidityUsd ?? 0;
  const wasDead = prevState?.isDead ?? false;
  let isDead = wasDead;
  if (
    !wasDead &&
    peak >= CONFIG.THRESHOLDS.DEAD_LIQUIDITY_MIN_PEAK_TO_TRACK &&
    liquidityUsd !== null &&
    (liquidityUsd < peak * CONFIG.THRESHOLDS.DEAD_LIQUIDITY_PCT_OF_PEAK ||
      liquidityUsd < CONFIG.THRESHOLDS.DEAD_LIQUIDITY_MIN_USD)
  ) {
    isDead = true;
    alerts.push({ kind: "DEAD", pair, peakLiquidityUsd: peak, currentLiquidityUsd: liquidityUsd, polledAt });
  }

  const nextState = snapshotFromPair(pair, polledAt, prevState);
  nextState.lastFdvTier = newTier;
  nextState.isDead = isDead;

  return { alerts, nextState, pairAddress };
}

async function pollAllPairs(env, polledAt) {
  const pairs = await fetchAllChainPairs();
  const backfilled = await isKnown(env, "anchorBackfillDone");
  const baselined = await isKnown(env, "anchorStateBaselineDone");
  const allStates = await getAllPairStates(env);
  const migratingToConsolidatedState = backfilled && Object.keys(allStates).length === 0;
  const alerts = [];

  for (const pair of pairs) {
    const pairAddress = pair.pairAddress.toLowerCase();
    const prevState = allStates[pairAddress] ?? null;

    if (!prevState && (!backfilled || migratingToConsolidatedState)) {
      allStates[pairAddress] = snapshotFromPair(pair, polledAt, null);
      continue;
    }

    if (!baselined) {
      const capValue = pair.marketCap ?? pair.fdv ?? null;
      const correctTier =
        capValue === null
          ? 0
          : CONFIG.THRESHOLDS.FDV_TIERS.reduce((tier, threshold) => (capValue >= threshold ? threshold : tier), 0);
      const repaired = snapshotFromPair(pair, polledAt, prevState);
      repaired.lastFdvTier = correctTier;
      allStates[pairAddress] = repaired;
      continue;
    }

    if (!prevState) alerts.push({ kind: "NEW_PAIR", pair, polledAt });

    const { alerts: pairAlerts, nextState } = evaluatePair(pair, prevState, polledAt);
    alerts.push(...pairAlerts);
    allStates[pairAddress] = nextState;
  }

  await saveAllPairStates(env, allStates);
  if (!backfilled) await markKnown(env, "anchorBackfillDone", null);
  if (!baselined) await markKnown(env, "anchorStateBaselineDone", null);
  return alerts;
}

// ---------------------------------------------------------------------------
// Alert formatting (Telegram Markdown) — matches the approved sample set
// ---------------------------------------------------------------------------

const SHORT_FOOTER = "🕵️‍♂️ Robinhood Detective";
const FULL_FOOTER = "🕵️‍♂️ Robinhood Detective | unofficial, not affiliated with Robinhood";

function dataAgeLine(polledAt) {
  return `⏱ data as of ${timeAgo(Date.now() - polledAt)}`;
}

function formatAlertMessage(alert) {
  const { kind, pair, polledAt } = alert;
  const subject = getSubjectToken(pair);
  const symbol = escapeMd(subject.symbol);
  const name = escapeMd(subject.name);
  const tokenAddress = subject.address ?? "unknown";
  const pairLabel = `${escapeMd(pair.baseToken?.symbol ?? "?")}/${escapeMd(pair.quoteToken?.symbol ?? "?")}`;
  const liquidityUsd = pair.liquidity?.usd ?? null;

  switch (kind) {
    case "NEW_PAIR": {
      const createdAgo = pair.pairCreatedAt ? timeAgo(Date.now() - pair.pairCreatedAt) : "unknown";
      return [
        "🆕 NEW PAIR — Robinhood Chain",
        "",
        `Token: $${symbol} (${name})`,
        `Pair: ${symbol}/${escapeMd(subject.otherSymbol)} on ${escapeMd(pair.dexId ?? "unknown DEX")}`,
        `Liquidity: ${fmtUsd(liquidityUsd)}`,
        `Created: ${createdAgo}`,
        "",
        `CA: \`${tokenAddress}\``,
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        "",
        FULL_FOOTER,
      ].join("\n");
    }

    case "LIQUIDITY_SPIKE":
    case "LIQUIDITY_DRAIN": {
      const isSpike = kind === "LIQUIDITY_SPIKE";
      const pctStr = `${isSpike ? "+" : ""}${(alert.pctChange * 100).toFixed(0)}%`;
      return [
        `${isSpike ? "💧 LIQUIDITY SURGE" : "🩸 LIQUIDITY DRAIN"} — ${pairLabel}`,
        "",
        `${pctStr} liquidity in the last poll`,
        `${fmtUsd(alert.prevLiquidityUsd)} → ${fmtUsd(liquidityUsd)}`,
        ...(isSpike ? [] : ["⚠️ Possible LP pull — DYOR"]),
        "",
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        SHORT_FOOTER,
      ].join("\n");
    }

    case "VOLUME_SURGE": {
      const buys = pair.txns?.m5?.buys ?? 0;
      const sells = pair.txns?.m5?.sells ?? 0;
      return [
        `📈 VOLUME SURGE — ${pairLabel}`,
        "",
        `5min volume: ${fmtUsd(pair.volume?.m5)} (${alert.multiplier.toFixed(1)}x trailing avg)`,
        `Buys: ${buys} · Sells: ${sells}`,
        "",
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        SHORT_FOOTER,
      ].join("\n");
    }

    case "PRICE_PUMP":
    case "PRICE_DUMP": {
      const isPump = kind === "PRICE_PUMP";
      return [
        `${isPump ? "🚀 PRICE PUMP" : "📉 PRICE DUMP"} — ${pairLabel}`,
        "",
        `${isPump ? "+" : ""}${alert.pct.toFixed(0)}% in ${alert.window}`,
        `Current price: ${fmtPrice(pair.priceUsd ? Number(pair.priceUsd) : null)}`,
        "",
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        SHORT_FOOTER,
      ].join("\n");
    }

    case "IMBALANCE_BUY":
    case "IMBALANCE_SELL": {
      const isBuy = kind === "IMBALANCE_BUY";
      return [
        `⚖️ ${isBuy ? "BUY" : "SELL"} IMBALANCE — ${pairLabel}`,
        "",
        `${alert.buys} buys vs ${alert.sells} sells (5min)`,
        `Heavy one-sided flow — ${isBuy ? "early momentum or wash pattern" : "possible exit pressure"}`,
        "",
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        SHORT_FOOTER,
      ].join("\n");
    }

    case "BOOSTED": {
      return [
        `🚀 TOKEN BOOSTED — ${pairLabel}`,
        "",
        "Just purchased a DexScreener boost",
        `Boost amount: ${alert.boost?.amount ?? "unknown"}`,
        "",
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        SHORT_FOOTER,
      ].join("\n");
    }

    case "MILESTONE": {
      return [
        `🎯 MILESTONE — ${pairLabel}`,
        "",
        `Market cap crossed ${fmtUsd(alert.tier)}`,
        `Current FDV: ${fmtUsd(alert.fdv)}`,
        "",
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        SHORT_FOOTER,
      ].join("\n");
    }

    case "DEAD": {
      return [
        `☠️ LIQUIDITY COLLAPSE — ${pairLabel}`,
        "",
        `Liquidity down to ${fmtUsd(alert.currentLiquidityUsd)} (was ${fmtUsd(alert.peakLiquidityUsd)} peak)`,
        "Token likely dead or rugged",
        "",
        `📊 ${pair.url}`,
        dataAgeLine(polledAt),
        SHORT_FOOTER,
      ].join("\n");
    }

    default:
      return `Unrecognized alert kind: ${kind}\n📊 ${pair.url}\n${SHORT_FOOTER}`;
  }
}

function cooldownKindFor(alertKind) {
  if (alertKind === "LIQUIDITY_SPIKE" || alertKind === "LIQUIDITY_DRAIN") return alertKind;
  if (alertKind === "VOLUME_SURGE") return "VOLUME_SURGE";
  if (alertKind === "PRICE_PUMP" || alertKind === "PRICE_DUMP") return "PRICE_MOVE";
  if (alertKind === "IMBALANCE_BUY" || alertKind === "IMBALANCE_SELL") return "IMBALANCE";
  return null; // NEW_PAIR, BOOSTED, MILESTONE, DEAD fire at most once — no cooldown needed
}

// ---------------------------------------------------------------------------
// Telegram send (unchanged behavior from the previous version)
// ---------------------------------------------------------------------------

async function sendTelegramMessage(env, text) {
  const isDryRun = String(env.DRY_RUN ?? "true").toLowerCase() === "true";
  if (isDryRun) {
    console.log("[DRY RUN] Would send Telegram message:\n" + text);
    return { ok: true, dryRun: true };
  }

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    throw new Error("Telegram secrets are not configured");
  }

  trackSubrequest();
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHANNEL_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function dispatchAlerts(env, alerts) {
  for (const alert of alerts) {
    if (isIgnoredPair(alert.pair)) {
      console.log(`Skipping ${alert.kind} for ignored pair ${alert.pair.pairAddress}`);
      continue;
    }

    const pairAddress = alert.pair.pairAddress;
    const cooldownKind = cooldownKindFor(alert.kind);

    if (cooldownKind && (await isOnCooldown(env, cooldownKind, pairAddress))) {
      console.log(`Skipping ${alert.kind} for ${pairAddress}: on cooldown`);
      continue;
    }

    if (!(await isUnderHourlyCap(env))) {
      console.log(`Hourly alert cap reached, skipping ${alert.kind} for ${pairAddress}`);
      continue;
    }

    try {
      const result = await sendTelegramMessage(env, formatAlertMessage(alert));
      if (result.dryRun) continue;
      if (cooldownKind) await startCooldown(env, cooldownKind, pairAddress, CONFIG.COOLDOWN_MINUTES[cooldownKind]);
      await incrementHourlyCap(env);
    } catch (err) {
      if (err.message === "SUBREQUEST_BUDGET_REACHED") break;
      console.error(`Failed to send ${alert.kind} alert for ${pairAddress}:`, err.message);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    subrequestCount = 0;
    subrequestReserve = 0;
    const polledAt = Date.now();

    try {
      const boostAlerts = await discoverBoosts(env, polledAt);

      subrequestReserve = ALERT_SUBREQUEST_RESERVE;
      let pairAlerts = [];
      try {
        pairAlerts = await pollAllPairs(env, polledAt);
      } finally {
        subrequestReserve = 0;
      }

      const allAlerts = [...boostAlerts, ...pairAlerts];
      console.log(`Polled Robinhood Chain via DexScreener. ${allAlerts.length} alert(s) generated.`);

      subrequestReserve = ALERT_SUBREQUEST_RESERVE;
      try {
        await dispatchAlerts(env, allAlerts);
      } finally {
        subrequestReserve = 0;
      }
    } catch (err) {
      if (err.message === "SUBREQUEST_BUDGET_REACHED") {
        console.log("Subrequest budget reached this run; remaining work resumes next cycle.");
        return;
      }
      console.error("Scheduled run failed:", err.message);
    }
  },

  // Manual visits just report status — they do NOT trigger a real poll.
  async fetch(request, env, ctx) {
    return new Response("Robinhood Detective is alive, tracking Robinhood Chain via DexScreener.");
  },
};
