import { keccak256, toHex, decodeEventLog, parseAbiItem } from "viem";

// ---- Our verified contract addresses (Robinhood Chain) ----
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const UNISWAP_V2_FACTORY = "0x8bceAA40B9acdfaEdf85adF4Ff01f5aD6517937f";
const UNISWAP_V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const UNISWAP_V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const MAX_LOG_BLOCK_RANGE = 2_000;
const MAX_SUBREQUESTS_PER_RUN = 40;
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
const GET_RESERVES_SELECTOR = "0x0902f1ac";
const BALANCE_OF_SELECTOR = "0x70a08231";

let cachedEthPrice = null;
let cachedEthPriceTime = 0;
let ethPricePromise = null;
let subrequestCount = 0;

// ---- Configurable settings (from the original spec) ----
const CONFIG = {
  MIN_LIQUIDITY_USD: 25000,
  SCORE_WEIGHTS: {
    NEW_POOL: 20,
    STRONG_LIQUIDITY: 20,
    VOLUME_ACCELERATION: 15,
    BUYER_GROWTH: 10,
    HOLDER_GROWTH: 10,
    BUY_SELL_IMBALANCE: 10,
    FOMO_SIGNAL: 5,
  },
};

// ---- Event definitions (human-readable — viem computes the correct topic hash for us) ----
const V2_PAIR_CREATED = parseAbiItem(
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"
);
const V3_POOL_CREATED = parseAbiItem(
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)"
);
const V4_INITIALIZE = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)"
);

// Small helper: call the RPC with any JSON-RPC method
async function rpcCall(method, params, rpcUrl = RPC_URL) {
  for (let attempt = 0; attempt < 3; attempt++) {
    trackSubrequest();
    let res;
    let json;
    try {
      res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      json = await res.json();
    } catch (err) {
      if (attempt === 2) throw new Error(`RPC request failed: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }

    const errorMessage = String(json.error?.message || "").toLowerCase();
    const isRateLimited = res.status === 429 || json.error?.code === 429 || errorMessage.includes("rate limit");
    if (isRateLimited) {
      if (attempt === 2) {
        throw new Error("RPC rate limit exceeded after 3 attempts.");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }

    if (!res.ok) {
      throw new Error(`RPC HTTP error: ${res.status}`);
    }
    if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    return json.result;
  }
}

function trackSubrequest() {
  subrequestCount++;
  if (subrequestCount >= MAX_SUBREQUESTS_PER_RUN) {
    throw new Error("SUBREQUEST_BUDGET_REACHED");
  }
}

async function getCurrentBlock(rpcUrl) {
  const hex = await rpcCall("eth_blockNumber", [], rpcUrl);
  if (typeof hex !== "string" || !/^0x[0-9a-f]+$/i.test(hex)) {
    throw new Error(`RPC returned an invalid block number: ${String(hex)}`);
  }
  return parseInt(hex, 16);
}

async function getEthUsdPriceOrNull(env) {
  const tenMinutes = 10 * 60 * 1000;
  if (cachedEthPrice && Date.now() - cachedEthPriceTime < tenMinutes) {
    return cachedEthPrice;
  }

  if (ethPricePromise) return ethPricePromise;

  ethPricePromise = (async () => {
    let cachedRaw = null;
    let cached = null;
    try {
      cachedRaw = await env.BOT_STATE.get("ethPriceCache");
      if (cachedRaw) {
        cached = JSON.parse(cachedRaw);
        if (typeof cached.price === "number" && Number.isFinite(cached.price) && cached.price > 0) {
          if (Date.now() - cached.time < tenMinutes) {
            cachedEthPrice = cached.price;
            cachedEthPriceTime = cached.time;
            return cached.price;
          }
        } else {
          cached = null;
        }
      }
    } catch (err) {
      console.error("ETH price cache read failed:", err.message);
      cached = null;
    }

    try {
      trackSubrequest();
      const res = await fetch(COINGECKO_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; RobinhoodDetectiveBot/1.0)",
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const json = await res.json();
      const price = json?.ethereum?.usd;
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
        throw new Error("Unexpected CoinGecko response shape");
      }
      const time = Date.now();
      await env.BOT_STATE.put("ethPriceCache", JSON.stringify({ price, time }));
      cachedEthPrice = price;
      cachedEthPriceTime = time;
      return price;
    } catch (err) {
      console.error("CoinGecko price fetch failed, continuing without USD conversion:", err.message);
      if (cached) {
        console.log(`Using stale cached ETH price from ${new Date(cached.time).toISOString()}`);
        return cached.price;
      }
      return null;
    }
  })();

  const price = await ethPricePromise;
  if (price === null) ethPricePromise = null;
  return price;
}

function encodeAddressParam(address) {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

async function ethCall(to, data, rpcUrl) {
  return rpcCall("eth_call", [{ to, data }, "latest"], rpcUrl);
}

async function getPoolLiquidity(finding, rpcUrl, env) {
  if (finding.source === "Uniswap V2") {
    const raw = await ethCall(finding.pair, GET_RESERVES_SELECTOR, rpcUrl);
    if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw) || raw.length < 258) {
      throw new Error("Invalid getReserves response");
    }

    const reserve0 = BigInt(`0x${raw.slice(2, 66)}`);
    const reserve1 = BigInt(`0x${raw.slice(66, 130)}`);
    const token0IsWeth = finding.token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
    const token1IsWeth = finding.token1.toLowerCase() === WETH_ADDRESS.toLowerCase();

    if (!token0IsWeth && !token1IsWeth) {
      return { pairedWithWeth: false, note: "Non-WETH pair - token amounts only, no USD figure" };
    }

    const ethPrice = await getEthUsdPriceOrNull(env);
    const wethAmount = Number(token0IsWeth ? reserve0 : reserve1) / 1e18;
    return {
      pairedWithWeth: true,
      wethAmount,
      usd: ethPrice === null ? null : wethAmount * ethPrice,
      ...(ethPrice === null ? { note: "WETH price unavailable this run" } : {}),
    };
  }

  if (finding.source === "Uniswap V3") {
    const token0IsWeth = finding.token0.toLowerCase() === WETH_ADDRESS.toLowerCase();
    const token1IsWeth = finding.token1.toLowerCase() === WETH_ADDRESS.toLowerCase();

    if (!token0IsWeth && !token1IsWeth) {
      return { pairedWithWeth: false, note: "Non-WETH pair - token amounts only, no USD figure" };
    }

    const ethPrice = await getEthUsdPriceOrNull(env);
    const raw = await ethCall(
      WETH_ADDRESS,
      `${BALANCE_OF_SELECTOR}${encodeAddressParam(finding.pool)}`,
      rpcUrl
    );
    if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) {
      throw new Error("Invalid WETH balance response");
    }

    const wethAmount = Number(BigInt(raw)) / 1e18;
    return {
      pairedWithWeth: true,
      wethAmount,
      usd: ethPrice === null ? null : wethAmount * ethPrice,
      ...(ethPrice === null ? { note: "WETH price unavailable this run" } : {}),
    };
  }

  return { pairedWithWeth: null, note: "N/A - V4 per-pool liquidity math not yet implemented" };
}

function computeSignalScore(finding, liquidity) {
  const weights = CONFIG.SCORE_WEIGHTS;
  let score = weights.NEW_POOL;
  const reasons = ["New DEX pool"];

  if (liquidity.pairedWithWeth && liquidity.usd !== null && liquidity.usd >= CONFIG.MIN_LIQUIDITY_USD) {
    score += weights.STRONG_LIQUIDITY;
    reasons.push("Strong initial liquidity");
  }

  return {
    score,
    maxPossibleRightNow: weights.NEW_POOL + weights.STRONG_LIQUIDITY,
    reasons,
  };
}

function passesFilter(finding, liquidity) {
  if (liquidity.pairedWithWeth !== true || liquidity.usd === null) {
    return { passes: false, reason: liquidity.note || "No verifiable USD liquidity yet" };
  }
  if (liquidity.usd < CONFIG.MIN_LIQUIDITY_USD) {
    return {
      passes: false,
      reason: `Liquidity $${liquidity.usd.toFixed(0)} below $${CONFIG.MIN_LIQUIDITY_USD} minimum`,
    };
  }
  return { passes: true, reason: "Meets liquidity threshold" };
}

function parseStoredBlock(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const block = Number(value);
  return Number.isSafeInteger(block) ? block : null;
}

// Builds "PairCreated(address,address,address,uint256)" from the parsed event
function formatEventSignature(event) {
  const types = event.inputs.map((i) => i.type).join(",");
  return `${event.name}(${types})`;
}

// Ask for logs matching ANY of our 3 events, from ANY of our 3 contracts, in one call
async function getAllPoolLogs(fromBlock, toBlock, rpcUrl) {
  const v2Topic = keccak256(toHex(formatEventSignature(V2_PAIR_CREATED)));
  const v3Topic = keccak256(toHex(formatEventSignature(V3_POOL_CREATED)));
  const v4Topic = keccak256(toHex(formatEventSignature(V4_INITIALIZE)));

  return rpcCall(
    "eth_getLogs",
    [
      {
        address: [UNISWAP_V2_FACTORY, UNISWAP_V3_FACTORY, UNISWAP_V4_POOL_MANAGER],
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
        topics: [[v2Topic, v3Topic, v4Topic]], // OR: match any of these three topics
      },
    ],
    rpcUrl
  );
}

async function checkForNewPools(env, fromBlock, toBlock, rpcUrl) {
  const findings = [];
  let lastCompletedBlock = fromBlock - 1;

  for (let chunkStart = fromBlock; chunkStart <= toBlock; chunkStart += MAX_LOG_BLOCK_RANGE) {
    const chunkEnd = Math.min(chunkStart + MAX_LOG_BLOCK_RANGE - 1, toBlock);
    let logs;
    try {
      logs = await getAllPoolLogs(chunkStart, chunkEnd, rpcUrl);

      for (const log of logs) {
        const address = log.address.toLowerCase();
        let finding = null;
        try {
          if (address === UNISWAP_V2_FACTORY.toLowerCase()) {
            const decoded = decodeEventLog({ abi: [V2_PAIR_CREATED], data: log.data, topics: log.topics });
            finding = { source: "Uniswap V2", type: "NEW_PAIR", ...decoded.args, txHash: log.transactionHash };
          } else if (address === UNISWAP_V3_FACTORY.toLowerCase()) {
            const decoded = decodeEventLog({ abi: [V3_POOL_CREATED], data: log.data, topics: log.topics });
            finding = { source: "Uniswap V3", type: "NEW_POOL", ...decoded.args, txHash: log.transactionHash };
          } else if (address === UNISWAP_V4_POOL_MANAGER.toLowerCase()) {
            const decoded = decodeEventLog({ abi: [V4_INITIALIZE], data: log.data, topics: log.topics });
            finding = { source: "Uniswap V4", type: "NEW_POOL", ...decoded.args, txHash: log.transactionHash };
          }
        } catch (err) {
          console.error("Could not decode a log, skipping it:", err.message);
          continue;
        }
        if (!finding) continue;

        let liquidity;
        try {
          liquidity = await getPoolLiquidity(finding, rpcUrl, env);
        } catch (err) {
          if (err.message === "SUBREQUEST_BUDGET_REACHED") throw err;
          console.error("Liquidity read failed for", finding.txHash, err.message);
          liquidity = { pairedWithWeth: null, usd: null, note: `Liquidity read error: ${err.message}` };
        }

        const filterResult = passesFilter(finding, liquidity);
        const signal = computeSignalScore(finding, liquidity);
        findings.push({ ...finding, liquidity, filterResult, signal });
      }
      lastCompletedBlock = chunkEnd;
    } catch (err) {
      if (err.message === "SUBREQUEST_BUDGET_REACHED") {
        console.log(`Subrequest budget reached at block ${chunkStart}. Will resume from ${lastCompletedBlock + 1} next run.`);
        break;
      }
      throw err;
    }
  }

  return { findings, lastCompletedBlock };
}

export default {
  async scheduled(event, env, ctx) {
    subrequestCount = 0;
    ethPricePromise = null;
    const rpcUrl = env.RPC_URL || RPC_URL;

    let currentBlock;
    try {
      currentBlock = await getCurrentBlock(rpcUrl);
    } catch (err) {
      console.error("Could not fetch current block, skipping this run:", err.message);
      return; // don't touch KV — just wait for the next scheduled run
    }

    const lastStr = await env.BOT_STATE.get("lastSeenBlock");
    const lastBlock = parseStoredBlock(lastStr) ?? currentBlock - 1;

    if (currentBlock <= lastBlock) {
      console.log("No new blocks yet.");
      return;
    }

    try {
      const scan = await checkForNewPools(env, lastBlock + 1, currentBlock, rpcUrl);
      const findings = scan.findings;
      console.log(`Checked blocks ${lastBlock + 1} to ${currentBlock}. Found ${findings.length} new pool(s).`);
      for (const f of findings) {
        const status = f.filterResult.passes ? "ALERT-WORTHY" : "filtered";
        console.log(
          `${status} | ${f.source} ${f.type} | Signal ${f.signal.score}/${f.signal.maxPossibleRightNow} | ${f.filterResult.reason}`
        );
      }
      await env.BOT_STATE.put("lastSeenBlock", scan.lastCompletedBlock.toString());
    } catch (err) {
      console.error("Log scan failed, will retry next run:", err.message);
      // Important: do NOT update lastSeenBlock here — so we retry this same range next time
    }
  },

  // Manual visits just report status — they do NOT trigger a real scan.
  // (The Cron Trigger already runs scans every 3 minutes; we don't want
  // every page load, favicon request, or bot crawler burning extra RPC calls.)
  async fetch(request, env, ctx) {
    const last = await env.BOT_STATE.get("lastSeenBlock");
    const lastBlock = parseStoredBlock(last);
    return new Response(`Robinhood Detective is alive. Last checked block: ${lastBlock ?? "not yet available"}`);
  },
};