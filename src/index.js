import { keccak256, toHex, decodeEventLog, parseAbiItem } from "viem";

// ---- Our verified contract addresses (Robinhood Chain) ----
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const UNISWAP_V2_FACTORY = "0x8bceAA40B9acdfaEdf85adF4Ff01f5aD6517937f";
const UNISWAP_V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const UNISWAP_V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const MAX_LOG_BLOCK_RANGE = 2_000;

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

async function getCurrentBlock(rpcUrl) {
  const hex = await rpcCall("eth_blockNumber", [], rpcUrl);
  if (typeof hex !== "string" || !/^0x[0-9a-f]+$/i.test(hex)) {
    throw new Error(`RPC returned an invalid block number: ${String(hex)}`);
  }
  return parseInt(hex, 16);
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
  for (let chunkStart = fromBlock; chunkStart <= toBlock; chunkStart += MAX_LOG_BLOCK_RANGE) {
    const chunkEnd = Math.min(chunkStart + MAX_LOG_BLOCK_RANGE - 1, toBlock);
    const logs = await getAllPoolLogs(chunkStart, chunkEnd, rpcUrl);

    for (const log of logs) {
      const address = log.address.toLowerCase();
      try {
        if (address === UNISWAP_V2_FACTORY.toLowerCase()) {
          const decoded = decodeEventLog({ abi: [V2_PAIR_CREATED], data: log.data, topics: log.topics });
          findings.push({ source: "Uniswap V2", type: "NEW_PAIR", ...decoded.args, txHash: log.transactionHash });
        } else if (address === UNISWAP_V3_FACTORY.toLowerCase()) {
          const decoded = decodeEventLog({ abi: [V3_POOL_CREATED], data: log.data, topics: log.topics });
          findings.push({ source: "Uniswap V3", type: "NEW_POOL", ...decoded.args, txHash: log.transactionHash });
        } else if (address === UNISWAP_V4_POOL_MANAGER.toLowerCase()) {
          const decoded = decodeEventLog({ abi: [V4_INITIALIZE], data: log.data, topics: log.topics });
          findings.push({ source: "Uniswap V4", type: "NEW_POOL", ...decoded.args, txHash: log.transactionHash });
        }
      } catch (err) {
        console.error("Could not decode a log, skipping it:", err.message);
      }
    }
  }

  return findings;
}

export default {
  async scheduled(event, env, ctx) {
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
      const findings = await checkForNewPools(env, lastBlock + 1, currentBlock, rpcUrl);
      console.log(`Checked blocks ${lastBlock + 1} to ${currentBlock}. Found ${findings.length} new pool(s).`);
      for (const f of findings) {
        console.log(JSON.stringify(f, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
      }
      // Only save progress if the scan actually succeeded
      await env.BOT_STATE.put("lastSeenBlock", currentBlock.toString());
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