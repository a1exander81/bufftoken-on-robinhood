#!/usr/bin/env node
/**
 * BuffCat volume bot — reads Uniswap V3 fee-growth accumulators, derives swap
 * volume, posts to Telegram.
 *
 * SECURITY: read-only. No wallet, no private key, no signing. The worst case
 * if this box is compromised is that someone reads public chain data and can
 * post to your Telegram chat. Keep it that way — never add a signer here.
 *
 *   npm i ethers node-fetch
 *   cp .env.example .env && edit
 *   node volume-bot.js
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const BUFFCAT = process.env.BUFFCAT || "0xD80aFe3Be875a14155FDd96D39669A6734E12036";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const TG_GROUP = process.env.TELEGRAM_GROUP_ID || "";
const BURN_INTERVAL_MS = Number(process.env.BURN_INTERVAL_MS || 3600000);
const TARGET_FILE = path.join(__dirname, "burn-target.json");
let BURN_CHAT = process.env.BURN_POST_CHAT || TG_GROUP || TG_CHAT;
let EXTRA_CHAT = "";
try {
  const t = JSON.parse(fs.readFileSync(TARGET_FILE, "utf8"));
  if (t && t.id) { BURN_CHAT = String(t.id); EXTRA_CHAT = String(t.id);
    console.log("burn target loaded from file: " + t.id + " (" + (t.title||"") + ")"); }
} catch {}
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 3600_000); // 1h
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "volume-state.json");
const MIN_REPORT_USD = Number(process.env.MIN_REPORT_USD || 0);

const Q128 = 1n << 128n;
const E18 = 10n ** 18n;

const POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
  "function feeGrowthGlobal0X128() view returns (uint256)",
  "function feeGrowthGlobal1X128() view returns (uint256)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8 feeProtocol,bool)",
];
const TOKEN_ABI = [
  "function liquidityPool() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const DEAD = "0x000000000000000000000000000000000000dEaD";

// ---------- math ----------
// volume = (deltaFeeGrowth * liquidity / 2^128) * 1e6 / fee
function volumeFrom(deltaFg, liquidity, fee) {
  const fees = (deltaFg * liquidity) / Q128;
  return (fees * 1_000_000n) / BigInt(fee);
}

// V3 accumulators are designed to wrap; subtraction is mod 2^256.
function wrapSub(a, b) {
  const MAX = 1n << 256n;
  return (a - b + MAX) % MAX;
}

// price of token1 (BUFFCAT) in token0 (WETH) from sqrtPriceX96
function priceFromSqrt(sqrtPriceX96) {
  const num = sqrtPriceX96 * sqrtPriceX96;
  return Number((num * 10n ** 18n) / (1n << 192n)) / 1e18;
}

const fmt = (wei, dp = 6) => Number(ethers.formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: dp });

// ---------- state ----------
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { fg0: BigInt(s.fg0), fg1: BigInt(s.fg1), liq: BigInt(s.liq), ts: s.ts };
  } catch {
    return null;
  }
}
function saveState(s) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ fg0: s.fg0.toString(), fg1: s.fg1.toString(), liq: s.liq.toString(), ts: s.ts }, null, 2)
  );
}

// ---------- telegram ----------
async function tg(text, chatId) {
  const target = chatId || TG_CHAT;
  if (!TG_TOKEN || !target) {
    console.log("[no telegram configured]\n" + text);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: target, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("telegram error:", res.status, await res.text());
}

// ---------- main ----------
// Read pool + compute volume since a given baseline. Does NOT write state.
async function readVolume(pool, fee, ethUsd, base) {
  const [fg0, fg1, liq, slot0] = await Promise.all([
    pool.feeGrowthGlobal0X128(),
    pool.feeGrowthGlobal1X128(),
    pool.liquidity(),
    pool.slot0(),
  ]);
  const d0 = wrapSub(fg0, base.fg0);
  const d1 = wrapSub(fg1, base.fg1);
  const buyWeth = volumeFrom(d0, liq, fee);
  const sellBuff = volumeFrom(d1, liq, fee);
  const buffPerWeth = priceFromSqrt(slot0.sqrtPriceX96);
  const sellWethEq = buffPerWeth > 0 ? Number(ethers.formatUnits(sellBuff, 18)) / buffPerWeth : 0;
  return {
    fg0, fg1, liq, slot0, buyWeth, sellBuff, buffPerWeth, sellWethEq,
    buyUsd: Number(ethers.formatUnits(buyWeth, 18)) * ethUsd,
    sellUsd: sellWethEq * ethUsd,
    drifted: liq !== base.liq,
  };
}

// ---------- supply / burn ----------
async function readSupply(token, pool, ethUsd) {
  const [total, burnt, slot0] = await Promise.all([
    token.totalSupply(), token.balanceOf(DEAD), pool.slot0(),
  ]);
  const circulating = total - burnt;
  const buffPerWeth = priceFromSqrt(slot0.sqrtPriceX96);
  const priceUsd = buffPerWeth > 0 ? ethUsd / buffPerWeth : 0;
  const burntF = Number(ethers.formatUnits(burnt, 18));
  const totalF = Number(ethers.formatUnits(total, 18));
  return { total, burnt, circulating, priceUsd,
    burntUsd: burntF * priceUsd,
    pctBurnt: totalF > 0 ? (burntF / totalF) * 100 : 0 };
}

function supplyLines(s) {
  return [
    `\u{1F525} <b>BUFFCAT BURN</b> \u{1F525}`,
    `\u{1F7E9} <b>Total Supply:</b> ${fmt(s.total, 0)}`,
    `\u{1F7E8} <b>Circulating Supply:</b> ${fmt(s.circulating, 0)} <i>(remaining)</i>`,
    `\u{1F525} <b>Total Burnt Token:</b> ${fmt(s.burnt, 0)} (${s.pctBurnt.toFixed(4)}%)`,
    `\u{1F4B5}\u{1F525} <b>Burnt Value:</b> ${s.burntUsd.toFixed(2)} USDG`,
    `Price: $${s.priceUsd.toFixed(8)}`,
  ];
}

// ---------- telegram command handling (read-only) ----------
let tgOffset = 0;
let awaitingTarget = "";
async function pollCommands(pool, fee, ethUsd, token) {
  if (!TG_TOKEN || !TG_CHAT) return;
  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates?offset=${tgOffset}&timeout=25`);
  } catch { return; }
  if (!res.ok) return;
  const body = await res.json();
  if (!body.ok) return;

  for (const upd of body.result) {
    tgOffset = upd.update_id + 1;
    const msg = upd.message;
    if (!msg || !msg.text) continue;

    // Only the configured chat may issue commands.
    const from = String(msg.chat.id);

    // /tg : owner-only, two-step. Prompt, then accept a group link or ID.
    const cmd0 = msg.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
    if (cmd0 === "/tg") {
      if (String(msg.from && msg.from.id) !== String(TG_CHAT)) {
        await tg("Only the owner can set the burn target.", from);
        continue;
      }
      awaitingTarget = from;
      await tg("Paste target telegram group\n\nAccepts: https://t.me/YourGroup, @YourGroup, or -1001234567890", from);
      continue;
    }

    // capture the pasted target
    if (awaitingTarget && from === awaitingTarget &&
        String(msg.from && msg.from.id) === String(TG_CHAT) && !msg.text.startsWith("/")) {
      const raw = msg.text.trim();
      let ref = raw;
      const m = raw.match(/t\.me\/([A-Za-z0-9_]+)/);
      if (m) ref = "@" + m[1];
      try {
        const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getChat?chat_id=${encodeURIComponent(ref)}`);
        const j = await r.json();
        if (!j.ok) {
          await tg("Could not resolve <code>" + ref + "</code>\n" + (j.description || "") +
                   "\n\nThe bot must be a member of the group. Add it, then try again.", from);
          awaitingTarget = "";
          continue;
        }
        const id = String(j.result.id);
        const title = j.result.title || j.result.username || id;
        fs.writeFileSync(TARGET_FILE, JSON.stringify({ id, title }, null, 2));
        BURN_CHAT = id; EXTRA_CHAT = id; awaitingTarget = "";
        await tg("Success\n\nTarget: <b>" + title + "</b>\nChat ID: <code>" + id + "</code>\nHourly card and /burn now go there.", from);
        console.log("burn target set -> " + id + " (" + title + ")");
      } catch (e) {
        await tg("Error: " + e.message, from);
        awaitingTarget = "";
      }
      continue;
    }

    if (!(from === String(TG_CHAT) || (TG_GROUP && from === String(TG_GROUP)) || (EXTRA_CHAT && from === EXTRA_CHAT))) continue;

    const cmd = msg.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
    if (cmd === "/burn") {
      try { await tg(supplyLines(await readSupply(token, pool, ethUsd)).join("\n")); }
      catch (e) { await tg("Error reading supply: " + e.message); }
      continue;
    }
    if (cmd !== "/vol") continue;

    const base = loadState();
    if (!base) { await tg("No baseline yet — wait for the first cycle."); continue; }

    try {
      const v = await readVolume(pool, fee, ethUsd, base);
      const mins = Math.round((Date.now() - base.ts) / 60000);
      const net = v.buyUsd - v.sellUsd;
      const bias = net > 0 ? "🟢 net BUYING" : net < 0 ? "🔴 net SELLING" : "⚪️ flat";
      const out = [
        `<b>BUFFCAT volume</b> — since last snapshot (${mins}m)`,
        ``,
        `Buys:  ${fmt(v.buyWeth)} WETH  ($${v.buyUsd.toFixed(2)})`,
        `Sells: ${fmt(v.sellBuff, 0)} BUFFCAT  ($${v.sellUsd.toFixed(2)})`,
        `Total: $${(v.buyUsd + v.sellUsd).toFixed(2)}`,
        `${bias}  ($${Math.abs(net).toFixed(2)})`,
        ``,
        `Price: $${(ethUsd / v.buffPerWeth).toFixed(8)} per BUFFCAT`,
      ];
      if (v.drifted) out.push(``, `⚠️ liquidity changed — estimate, not exact.`);
      await tg(out.join("\n"));
    } catch (e) {
      await tg("Error reading pool: " + e.message);
    }
  }
}

async function tick(pool, fee, ethUsd) {
  const [fg0, fg1, liq, slot0] = await Promise.all([
    pool.feeGrowthGlobal0X128(),
    pool.feeGrowthGlobal1X128(),
    pool.liquidity(),
    pool.slot0(),
  ]);

  const now = Date.now();
  const prev = loadState();
  saveState({ fg0, fg1, liq, ts: now });

  if (!prev) {
    console.log("baseline captured, no report this cycle");
    return;
  }

  const d0 = wrapSub(fg0, prev.fg0);
  const d1 = wrapSub(fg1, prev.fg1);
  const buyWeth = volumeFrom(d0, liq, fee);
  const sellBuff = volumeFrom(d1, liq, fee);

  if (buyWeth === 0n && sellBuff === 0n) {
    console.log("no swaps this interval");
    return;
  }

  const drifted = liq !== prev.liq;
  const mins = Math.round((now - prev.ts) / 60000);

  const buffPerWeth = priceFromSqrt(slot0.sqrtPriceX96);
  const sellWethEq = buffPerWeth > 0 ? Number(ethers.formatUnits(sellBuff, 18)) / buffPerWeth : 0;
  const buyUsd = Number(ethers.formatUnits(buyWeth, 18)) * ethUsd;
  const sellUsd = sellWethEq * ethUsd;

  if (buyUsd + sellUsd < MIN_REPORT_USD) {
    console.log(`below MIN_REPORT_USD ($${(buyUsd + sellUsd).toFixed(2)})`);
    return;
  }

  const net = buyUsd - sellUsd;
  const bias = net > 0 ? "🟢 net BUYING" : net < 0 ? "🔴 net SELLING" : "⚪️ flat";

  const lines = [
    `<b>BUFFCAT volume</b> — last ${mins}m`,
    ``,
    `Buys:  ${fmt(buyWeth)} WETH  ($${buyUsd.toFixed(2)})`,
    `Sells: ${fmt(sellBuff, 0)} BUFFCAT  ($${sellUsd.toFixed(2)})`,
    `Total: $${(buyUsd + sellUsd).toFixed(2)}`,
    `${bias}  ($${Math.abs(net).toFixed(2)})`,
  ];
  if (drifted) {
    lines.push(``, `⚠️ liquidity changed this interval (${prev.liq} → ${liq}) — figures are estimates, not exact.`);
  }
  if (slot0.feeProtocol && slot0.feeProtocol !== 0n) {
    lines.push(``, `⚠️ protocol fee is set (${slot0.feeProtocol}) — volume is UNDERSTATED.`);
  }

  await tg(lines.join("\n"));
  console.log(lines.join("\n"));
}

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  if (net.chainId !== 4663n) throw new Error(`wrong chain: ${net.chainId}, want 4663`);

  const token = new ethers.Contract(BUFFCAT, TOKEN_ABI, provider);
  const poolAddr = await token.liquidityPool();
  if (poolAddr === ethers.ZeroAddress) throw new Error("liquidityPool() returned zero address");

  const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
  const fee = await pool.fee();
  console.log(`pool ${poolAddr}  fee ${Number(fee) / 10000}%  interval ${INTERVAL_MS / 60000}m`);

  // ETH/USD is not available on-chain here; set it manually or wire a source.
  const ethUsd = Number(process.env.ETH_USD || 1846);

  await tick(pool, fee, ethUsd).catch(console.error);
  setInterval(() => tick(pool, fee, ethUsd).catch(console.error), INTERVAL_MS);

  // long-poll Telegram for /vol
  (async function loop() {
    for (;;) {
      await pollCommands(pool, fee, ethUsd, token).catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  console.log("command poller started (/vol, /burn, /tg)");

  async function postBurn() {
    try { await tg(supplyLines(await readSupply(token, pool, ethUsd)).join("\n"), BURN_CHAT); }
    catch (e) { console.error("burn post failed:", e.message); }
  }
  await postBurn();
  setInterval(postBurn, BURN_INTERVAL_MS);
  console.log("burn card every " + (BURN_INTERVAL_MS/60000) + "m -> chat " + BURN_CHAT);
})();
