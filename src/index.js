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
const NATIVE_ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const ANCHOR_TOKENS = [
  NATIVE_ETH_ADDRESS,
  WETH_ADDRESS,
  USDG_ADDRESS,
  "0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E", // AAOI
  "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", // AAPL
  "0x3139D77Ace0cbAA5bDfD38bD1F1911a794AF0B0e", // ABCL
  "0x232B8ed6377BE97813853B0Ac104c4Cda8378d1B", // ADBE
  "0x5F604fBA1162193A4388A5DFa56F556f3E133cC2", // AEHR
  "0xfAf9cb261B5FCC1f404Bb10CD39C5c6C1974E612", // AEIS
  "0x748c32c3ca24eDf31ea597Db1F3d330a7a6DA3Dc", // ALAB
  "0x36046893810a7E7fCE501229d57dc3FC8c8716d0", // AMAT
  "0x99D9D8663545151603863C5AcbD6FC3218899009", // AMBA
  "0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B", // AMC
  "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", // AMD
  "0xDd356AA38F40A7b7076755aC854B6FBb1F0D305B", // AMKR
  "0x12f190a9F9d7D37a250758b26824B97CE941bF54", // AMZN
  "0x28bABD556b60E53663B8615036479a29c2CDd1Bf", // ANET
  "0xb8DBf92F9741c9ac1c32115E78581f23509916FD", // APLD
  "0xA249BAF1063Af884807C1E1400AEf7784836917E", // APP
  "0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA", // ASML
  "0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137", // ASTS
  "0x373C06c4f7BDe527D7Dae4BA169E42b55E393CeD", // AUR
  "0xF6290b5e7C26502e2dA514C31509849718EA76A5", // AVAV
  "0x156E175DD063a8cE274C50654eF40e0032b3fbcF", // AVGO
  "0xC27dBD474aF5181c5A8777903690D8D262D12648", // AXON
  "0x141eEa040c2250eEc0314e336975e81f85f6585e", // AXTI
  "0x4D21483a44Bf67a86b77E3dA301411880797D452", // BA
  "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4", // BABA
  "0x48E39E56aCdbA37b09020C0b734A613C9a2f100A", // BB
  "0x822CC93fFD030293E9842c30BBD678F530701867", // BE
  "0x2F62fC9fAbb470C690f141c28340eD832bB27020", // BND
  "0xceF9027c7d6985b85f0BA431125073529A947A68", // BULL
  "0x5c90450Bbb4273D7b2f17CF6917AEB237A569679", // CBRS
  "0x9651342CeA770aE9a2969Ba2A52611523146aef9", // CCL
  "0xaE517A2903E68bd929Dfd15be875F8369D53e94a", // CEG
  "0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF", // CELH
  "0x44f6D488021f8233B9416294d1FE9b1fEe28382d", // CIEN
  "0x62200915e7DEab1eC7f79fb246daDbB80eACdDd0", // CLOV
  "0xBf449977089c718C004a66C554B26B94ef3Ad4De", // CLS
  "0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3", // CLSK
  "0x92F9F459F1a9a5AD266b182BE7Bffd1C6c666894", // COHR
  "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", // COIN
  "0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2", // COST
  "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", // CRCL
  "0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b", // CRDO
  "0xd95B44124e475743a7589e68F3D74008A5536D44", // CRM
  "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931", // CRWD
  "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3", // CRWV
  "0xF543967EEBB6f1917992eF0E68De63ab07a5a0dA", // CSCO
  "0x63D5a3b6939a33f1e75d8Bcd85759858239600DB", // CTSH
  "0xa4f319104089FE321dc8093C6E707d4fE190A988", // CVNA
  "0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958", // DDOG
  "0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd", // DELL
  "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516", // DJT
  "0xc02f12B9fe9E707079EC0d546f3050d3F6C1F8bD", // DOCN
  "0x39EC44Bee4F6A116c6F9B8De566848a985C53C60", // ELF
  "0x1c690498150252222C275A5CEd69d3A6b1f52D5E", // EWT
  "0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc", // EWY
  "0x25C288E6D899b9BC30160965aD9644c67e73bE0C", // F
  "0xa48F22A46C0F1C46CA7D111CB6c137c271987180", // FICO
  "0x41F4267525a8AFf329540eF24fD83d9044758B33", // FIG
  "0x9ECe29A4A2397C0a35fb5fA8EE2b9509130a98cc", // FISV
  "0x93Dbb1d2Dc5D63F4abACFF30485273f538Df68Ac", // FIX
  "0x282e87451E10fA6679BC7D76C69BE44cD3fC777C", // FLNC
  "0x03BC731Ffb162cdd7B98D3C6542bFC291126075d", // FLY
  "0x3FB8976980d486084b2eb4a404BD12e72823958f", // FTNT
  "0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D", // FUTU
  "0x63b814DDBd6BF339f25Fed8c36158a008D5B373e", // GE
  "0x94B8AAE43A1cCc08Aa64B7D1F29b4D920aF4a0C9", // GEV
  "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", // GLD
  "0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6", // GLW
  "0x2D427692E928fa156ec22acfaBaFA0447C5805B7", // GLXY
  "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", // GME
  "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", // GOOGL
  "0xEB61c0Ed490A367d4E3631cCf8a74B3bfc7E775D", // HII
  "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09", // HIMS
  "0x59dd09d4900C2E4B5F75b7c0d4E6796fcc234Cb1", // HPE
  "0xAEa445c5F3DB1a462998ccC422A875A361ee5d99", // HWM
  "0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619", // IBM
  "0x7c148F74ac7445D1F28366b7FcDC6792a9Fcd0Cf", // IBRX
  "0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6", // INDA
  "0xB853bC83a753342a4f8320ea680b4B1E84118D21", // INFQ
  "0xf1953DAB6FaD537488d5A022361FfAa8B4c95eC6", // INOD
  "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681", // INTC
  "0x56d23beE5f41A7120170b0c603Dae30128e460e9", // INTU
  "0x558378E000D634A36593E338eBacdd6207640EfE", // IONQ
  "0xF0AB0c93bE6F41369d302e55db1A96b3c430212D", // IREN
  "0xEAf2512dFC1bEAc608F8794B3793CD4E02894Aa6", // JBL
  "0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80", // JNJ
  "0xb334C5cE741B80B5B671F47F5C269Cb193fe8E24", // JOBY
  "0x96b933C74eCB4A0926b9210cef7b743EF46be2E9", // KLAC
  "0x12e3c047bf9AeCAF9dDC98c05C31BFD1dd043993", // KSS
  "0x7FD06a4d81cCfA3F351394E144d5191874C31313", // KTOS
  "0x48d60243c66437c6ac3c2495Be94747aEd5Dfe25", // LHX
  "0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C", // LITE
  "0x8005d266423c7ea827372c9c864491e5786600ea", // LLY
  "0x329fcACEb9AD6F9580DD5F643fed0646900D043c", // LMT
  "0x57b0030166DB0C31690d1A5aA167e2e26e2C29a4", // LRCX
  "0x4e62068525Ab11FE768e29dfD00ef909B9803016", // LULU
  "0xa5D4968421bA94814Be3B136b15cf422101aC1a3", // LUNR
  "0xDdf2266b79abf0B48898959B0ed6E6adf512be74", // MDB
  "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", // META
  "0xc6Cbad1016b38B797610c25E1dc7D95988B1f362", // MOD
  "0x52D50D0280AD1054b43f052bD70a49a212A1b128", // MPWR
  "0x43B07D15cE533bEc5476d70C22a78a1B2B662155", // MRNA
  "0x62fd0668e10D8B72339BE2DCF7643001688ff13B", // MRVL
  "0xe93237C50D904957Cf27E7B1133b510C669c2e74", // MSFT
  "0xec262a75e413fAfD0dF80480274532C79D42da09", // MSTR
  "0xC93f4d80e268AB922e871bd169156C3CC41894e6", // MTSI
  "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD", // MU
  "0x48961813349333209994750ffA89b3c5C22eC969", // MXL
  "0xf7181b63Fdb858558A74ba96BC42732684cd7965", // NAVN
  "0x9D9c6684F596F66a64C030B93A886D51Fd4D7931", // NBIS
  "0x116F00968269B7bfbaD4109cE591d6E74c0601d4", // NET
  "0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8", // NFLX
  "0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926", // NNE
  "0x0C3260aF4B8f13a69c4c2dFb84fD667890CDFa14", // NOW
  "0x408c14038a04f7bD235329E26d2bf569ee20e250", // NU
  "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", // NVDA
  "0xbE6702d7b70315376dC48a3293f24f0982F86386", // NVTS
  "0x8B2f88497f15A18E9D4FFa1a8fFB8538399aE774", // OKLO
  "0xbBD09F72b025360FeE5C928053Dca6248d35be54", // ON
  "0x8ff63eAeEe3fE54Ba450c4F5538064Ec5A893Aef", // ONTO
  "0xb0992820E760d836549ba69BC7598b4af75dEE03", // ORCL
  "0x40E7a279850e443f582059ae5dC1c3b6563E6395", // OUST
  "0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D", // P
  "0xB039597eD45CbA7B6E2fb9E8BE51802969CEe5Be", // PANW
  "0xfb2664f07B6Aadd29ea7a59D8859b1AeB8645cDa", // PATH
  "0x9b23573b156B52565012F5cE02CDF60AFBaa70Be", // PENG
  "0x7066A64c24e4206CD62E83bf198c1E7EB361F51e", // PFE
  "0xAA4d64474c172010aB57719cb9951E6142a100d3", // PL
  "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", // PLTR
  "0xcf6B2D875361be807EAfa57458c80f28521F9333", // POET
  "0x237c16D66590F67B886d978ACD362EAeaD8B18c7", // POWL
  "0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C", // PR
  "0x9Ab02Ead789b6903c3c44d0ED32F9c707CDF12FD", // PWR
  "0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc", // QBTS
  "0x0f17206447090e464C277571124dD2688E48AEA9", // QCOM
  "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", // QQQ
  "0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4", // QUBT
  "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8", // RBLX
  "0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460", // RCAT
  "0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C", // RDDT
  "0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE", // RDW
  "0x284358abc07F9359f19f4b5b4aC91901Be2597Ba", // RGTI
  "0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B", // RIVN
  "0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2", // RKLB
  "0x756Bc80af765C82da966a788858d65aDF14f3793", // RUN
  "0x95052ddcd5DC25641657424A8Cf04834997E1730", // SATS
  "0xd63ABB2C13d7a8421a8017a712802053568e3C1D", // SCHD
  "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", // SGOV
  "0xF53F66751B1Eff985311b693531E3290F600c410", // SHOP
  "0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8", // SHY
  "0x77E655E37F4d913fB9540e0d541D824171a60e81", // SIMO
  "0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8", // SKHY
  "0x285b231728c7E4333799183DF1094d775246a535", // SLS
  "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f", // SLV
  "0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a", // SMCI
  "0x072f979c2CAc8e1391B0162a87Fee094bF8744a0", // SMH
  "0x1Eebee7F74517e0279dFb09d25B0407bEEc3FDd6", // SMR
  "0xF6589F11Bc40b669e584073F428B05562F568733", // SNAP
  "0xB90A19fF0Af67f7779afF50A882A9CfF42446400", // SNDK
  "0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E", // SNOW
  "0x98E75885157C80992A8D41b696D8c9C6Fb30A926", // SOFI
  "0x6E3Dfd9f7e1649BaA14D25cac18C94d62dB10A54", // SOUN
  "0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38", // SOXX
  "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", // SPCX
  "0xAd622320e520de39e72d41EF07438C3Fd3354875", // SPMO
  "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", // SPY
  "0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D", // TE
  "0x5B97476b922F3305131B8f0B9D333172E87f4aaE", // TEAM
  "0xB1CC0EC7Db69Cf43539119814df40071b9d61793", // TEM
  "0x2778C5024D5cA2CdB0f8eAD671ffc69963AdCD9", // TER
  "0x89776d4Cd68193597A2fC132cfaC1fDe36CCeA8a", // TSEM
  "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", // TSLA
  "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA", // TSM
  "0x0b5fb4031cae9163db10B169Ee72685F0EdC8545", // TTD
  "0x5e81213613b6B86EaB4c6c50d718d34359459786", // TTWO
  "0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79", // UMC
  "0xcF364ea52787e289De6F32077834056E3E70D6A8", // UNH
  "0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2", // UPS
  "0xd917B029C761D264c6A312BBbcDA868658eF86a6", // USAR
  "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344", // USO
  "0x6006ed4B2F94110851ff7509D97D034f0EeD9226", // VICR
  "0xFA78C12E6488814A0262E4e802749a4a737d5fB7", // VRT
  "0x26dCbfb34FC83CAbD6990f449674efDc6097fF85", // VSAT
  "0x561e2a49212b7cCF47f2744Ccb83e200722fADBc", // VST
  "0x0594134DF3f171a354D9C85eBD65b7A6148F6D09", // VTI
  "0x82DA4646242e1D962e96e932269Dc644c94a9CaA", // WDAY
  "0xF52597345A8Edf418bc4071b4a35112472277D3e", // WDC
  "0x348Be1A8663f15edDe5CDf8A96BB69078f7aB6Fd", // WULF
  "0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E", // WYFI
  "0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43", // XLK
  "0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289", // XNDU
  "0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5", // XOM
  "0x44c4F142009036cF477eD2d09932051843137CF1", // ZM
  "0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7", // ZS
];
const IGNORED_PAIRS = new Set(["USDG/WETH"]);

const MAX_ADDRESSES_PER_CALL = 30;
const MAX_SUBREQUESTS_PER_RUN = 45; // Cloudflare Workers subrequest ceiling headroom
const ALERT_SUBREQUEST_RESERVE = 5; // keep room for Telegram sends after data fetching

const CONFIG = {
  MAX_ALERTS_PER_HOUR: 250,
  THRESHOLDS: {
    LIQUIDITY_PCT: 0.3,
    LIQUIDITY_MIN_USD_MOVE: 2500,
    VOLUME_MULTIPLIER: 3,
    VOLUME_MIN_USD: 250,
    PRICE_PCT_5M: 25,
    PRICE_PCT_1H: 60,
    IMBALANCE_RATIO: 10, // 10:1
    IMBALANCE_MIN_TXNS: 10,
    EXTREME_PRICE_PCT: 100,       // 🚨 threshold for siren-level price moves
    HIGH_IMBALANCE_RATIO: 25,     // 🔥 threshold for extreme buy/sell imbalance
    HIGH_VOLUME_MULTIPLIER: 10,   // ⚡ threshold for massive volume surges
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
  for (const chunk of chunkArray(ANCHOR_TOKENS, MAX_ADDRESSES_PER_CALL)) {
    try {
      const pairs = await fetchPairsForTokenBatch(chunk);
      for (const pair of pairs) seen.set(pair.pairAddress.toLowerCase(), pair);
    } catch (err) {
      if (err.message === "SUBREQUEST_BUDGET_REACHED") throw err;
      console.error(`Anchor discovery failed for ${chunk.length} tokens:`, err.message);
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
      const isHigh = alert.multiplier >= CONFIG.THRESHOLDS.HIGH_VOLUME_MULTIPLIER;
      const emoji = isHigh ? "⚡📈" : "📈";
      const label = isHigh ? "MASSIVE VOLUME SURGE" : "VOLUME SURGE";
      return [
        `${emoji} ${label} — ${pairLabel}`,
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
      const isExtreme = Math.abs(alert.pct) >= CONFIG.THRESHOLDS.EXTREME_PRICE_PCT;
      const emoji = isExtreme ? "🚨" : isPump ? "🚀" : "📉";
      const label = isExtreme
        ? isPump ? "EXTREME PUMP" : "EXTREME DUMP"
        : isPump ? "PRICE PUMP" : "PRICE DUMP";
      return [
        `${emoji} ${label} — ${pairLabel}`,
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
      const ratio = isBuy
        ? alert.sells > 0 ? alert.buys / alert.sells : alert.buys
        : alert.buys > 0 ? alert.sells / alert.buys : alert.sells;
      const isHigh = ratio >= CONFIG.THRESHOLDS.HIGH_IMBALANCE_RATIO;
      const emoji = isHigh ? "🔥⚖️" : "⚖️";
      const label = isHigh
        ? isBuy ? "EXTREME BUY IMBALANCE" : "EXTREME SELL IMBALANCE"
        : isBuy ? "BUY IMBALANCE" : "SELL IMBALANCE";
      return [
        `${emoji} ${label} — ${pairLabel}`,
        "",
        `${alert.buys} buys vs ${alert.sells} sells (5min, ~${ratio.toFixed(0)}:1)`,
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

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: env.TELEGRAM_CHANNEL_ID,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };

  // Telegram throttles bursts with HTTP 429 + retry_after. Wait and retry once so
  // alerts raised in the same run still get delivered instead of being dropped.
  for (let attempt = 1; attempt <= 2; attempt++) {
    trackSubrequest();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) return json;

    const retryAfter = json?.parameters?.retry_after;
    if (res.status === 429 && typeof retryAfter === "number" && attempt < 2) {
      await sleep(Math.min(retryAfter * 1000, 8000));
      continue;
    }
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const TELEGRAM_SEND_INTERVAL_MS = 1200; // Telegram same-chat limit is ~1 msg/sec

async function dispatchAlerts(env, alerts) {
  let lastSendAt = 0;
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
      const now = Date.now();
      if (lastSendAt > 0 && now - lastSendAt < TELEGRAM_SEND_INTERVAL_MS) {
        await sleep(TELEGRAM_SEND_INTERVAL_MS - (now - lastSendAt));
      }
      lastSendAt = Date.now();
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