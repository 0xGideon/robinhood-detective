import { keccak256, toHex, decodeEventLog, parseAbiItem } from "viem";

// ---- Our verified contract addresses (Robinhood Chain) ----
const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const UNISWAP_V2_FACTORY = "0x8bceAA40B9acdfaEdf85adF4Ff01f5aD6517937f";
const UNISWAP_V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const UNISWAP_V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";

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
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await res.json();

    if (res.status === 429 || json.error?.code === 429) {
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
  return parseInt(hex, 16);
}

// Ask for logs matching an event, from a specific contract, in a block range
async function getLogs(address, event, fromBlock, toBlock, rpcUrl) {
  const topic = keccak256(toHex(event.signature ?? formatEventSignature(event)));
  // viem's parseAbiItem gives us what we need to build the topic ourselves:
  return rpcCall("eth_getLogs", [
    {
      address,
      fromBlock: toHex(fromBlock),
      toBlock: toHex(toBlock),
      topics: [topic],
    },
  ], rpcUrl);
}

// Builds "PairCreated(address,address,address,uint256)" from the parsed event
function formatEventSignature(event) {
  const types = event.inputs.map((i) => i.type).join(",");
  return `${event.name}(${types})`;
}

async function checkForNewPools(env, fromBlock, toBlock, rpcUrl) {
  const findings = [];

  // V2 new pairs
  const v2Logs = await getLogs(UNISWAP_V2_FACTORY, V2_PAIR_CREATED, fromBlock, toBlock, rpcUrl);
  for (const log of v2Logs) {
    const decoded = decodeEventLog({ abi: [V2_PAIR_CREATED], data: log.data, topics: log.topics });
    findings.push({ source: "Uniswap V2", type: "NEW_PAIR", ...decoded.args, txHash: log.transactionHash });
  }

  // V3 new pools
  const v3Logs = await getLogs(UNISWAP_V3_FACTORY, V3_POOL_CREATED, fromBlock, toBlock, rpcUrl);
  for (const log of v3Logs) {
    const decoded = decodeEventLog({ abi: [V3_POOL_CREATED], data: log.data, topics: log.topics });
    findings.push({ source: "Uniswap V3", type: "NEW_POOL", ...decoded.args, txHash: log.transactionHash });
  }

  // V4 new pools (singleton PoolManager)
  const v4Logs = await getLogs(UNISWAP_V4_POOL_MANAGER, V4_INITIALIZE, fromBlock, toBlock, rpcUrl);
  for (const log of v4Logs) {
    const decoded = decodeEventLog({ abi: [V4_INITIALIZE], data: log.data, topics: log.topics });
    findings.push({ source: "Uniswap V4", type: "NEW_POOL", ...decoded.args, txHash: log.transactionHash });
  }

  return findings;
}

export default {
  async scheduled(event, env, ctx) {
    const rpcUrl = env.RPC_URL || RPC_URL;
    const currentBlock = await getCurrentBlock(rpcUrl);
    const lastStr = await env.BOT_STATE.get("lastSeenBlock");
    const lastBlock = lastStr ? parseInt(lastStr, 10) : currentBlock - 1;

    if (currentBlock <= lastBlock) {
      console.log("No new blocks yet.");
      return;
    }

    const findings = await checkForNewPools(env, lastBlock + 1, currentBlock, rpcUrl);

    console.log(`Checked blocks ${lastBlock + 1} to ${currentBlock}. Found ${findings.length} new pool(s).`);
    for (const f of findings) {
      console.log(JSON.stringify(f, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    }

    await env.BOT_STATE.put("lastSeenBlock", currentBlock.toString());
  },

  async fetch(request, env, ctx) {
    await this.scheduled(null, env, null);
    const last = await env.BOT_STATE.get("lastSeenBlock");
    return new Response(`Robinhood Detective is alive. Last checked block: ${last}`);
  },
};