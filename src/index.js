export default {
  // This runs on our Cron schedule (every 3 minutes)
  async scheduled(event, env, ctx) {
    const rpcUrl = "https://rpc.mainnet.chain.robinhood.com";

    // eth_blockNumber asks the blockchain: "what's the most recent block?"
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
    });

    const data = await response.json();
    // The result comes back as a hex string like "0x1a2b3c" — convert to a normal number
    const currentBlock = parseInt(data.result, 16);

    console.log("Current Robinhood Chain block:", currentBlock);

    // Save it to KV so we remember it next time (we'll use this properly in Step 9)
    await env.BOT_STATE.put("lastSeenBlock", currentBlock.toString());
  },

  // This lets us manually trigger a test by visiting the Worker's URL in a browser
  async fetch(request, env, ctx) {
    await this.scheduled(null, env, null);
    const last = await env.BOT_STATE.get("lastSeenBlock");
    return new Response(`Robinhood Detective is alive. Last seen block: ${last}`);
  },
};