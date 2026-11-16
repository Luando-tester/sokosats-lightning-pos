require("dotenv").config();
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const bitcoin = require("bitcoinjs-lib");
const ecc = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");
const bip39 = require("bip39");
const { requestInvoice } = require("lnurl-pay");
const QRCode = require("qrcode");

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT) || 3000;
const NETWORK_NAME = (process.env.BITCOIN_NETWORK || "testnet").toLowerCase();
const BTC_NETWORK =
  NETWORK_NAME === "bitcoin" || NETWORK_NAME === "mainnet"
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;

// Trên Vercel serverless filesystem gốc (/var/task) là read-only, chỉ /tmp ghi được
const BASE_STORAGE_DIR = process.env.VERCEL ? os.tmpdir() : __dirname;
const WALLET_PERSIST_FILE = path.join(BASE_STORAGE_DIR, ".merchant_wallet.secret.json");

// 1. Khởi tạo ví Bitcoin BIP84 (Native SegWit bech32) non-custodial cho Merchant
function initMerchantWallet() {
  let mnemonic = (process.env.MERCHANT_MNEMONIC || "").trim();
  let source = "env";

  if (!mnemonic || !bip39.validateMnemonic(mnemonic)) {
    if (fs.existsSync(WALLET_PERSIST_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(WALLET_PERSIST_FILE, "utf8"));
        if (saved?.mnemonic && bip39.validateMnemonic(saved.mnemonic)) {
          mnemonic = saved.mnemonic;
          source = process.env.VERCEL ? "vercel-tmp-ephemeral" : "persisted-file";
        }
      } catch {
        // Bỏ qua nếu file hỏng, sẽ sinh lại bên dưới
      }
    }
  }

  if (!mnemonic || !bip39.validateMnemonic(mnemonic)) {
    mnemonic = bip39.generateMnemonic(128);
    source = process.env.VERCEL ? "vercel-ephemeral-generated" : "auto-generated-saved";
    try {
      fs.writeFileSync(
        WALLET_PERSIST_FILE,
        JSON.stringify({ createdAt: new Date().toISOString(), network: NETWORK_NAME, mnemonic }, null, 2),
        { mode: 0o600 }
      );
      fs.chmodSync(WALLET_PERSIST_FILE, 0o600);
    } catch {
      // Bỏ qua lỗi ghi đĩa trên môi trường serverless bị khóa write
    }
  }

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, BTC_NETWORK);
  const coinType = BTC_NETWORK === bitcoin.networks.bitcoin ? 0 : 1;
  const derivationPath = `m/84'/${coinType}'/0'/0/0`;
  const child = root.derivePath(derivationPath);

  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network: BTC_NETWORK,
  });

  return {
    network: NETWORK_NAME,
    derivationPath,
    onchainAddress: address,
    publicKeyHex: Buffer.from(child.publicKey).toString("hex"),
    walletSource: source,
  };
}

const merchantWallet = initMerchantWallet();

const SEED_CATALOG = [
  { id: "rice-1kg", name: "Riz parfumé (1kg)", localPrice: 650, currency: "XOF" },
  { id: "oil-1l", name: "Huile végétale (1L)", localPrice: 1100, currency: "XOF" },
  { id: "attaya-pack", name: "Thé Attaya + Sucre", localPrice: 500, currency: "XOF" },
  { id: "bread-baguette", name: "Pain Tapalapa", localPrice: 200, currency: "XOF" },
  { id: "solar-charge", name: "Recharge téléphone solaire", localPrice: 300, currency: "XOF" },
];

const invoicesLedger = [];
let rateCache = { fetchedAt: 0, btcUsd: 90000 };

async function getLiveBtcRates() {
  const now = Date.now();
  if (now - rateCache.fetchedAt < 5 * 60 * 1000 && rateCache.btcUsd > 0) {
    return rateCache;
  }
  try {
    const resp = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
      signal: AbortSignal.timeout(6000),
    });
    if (resp.ok) {
      const json = await resp.json();
      const spot = Number(json?.data?.amount);
      if (spot > 0) {
        rateCache = { fetchedAt: now, btcUsd: spot };
      }
    }
  } catch {
    // Giữ cache nếu mạng yếu
  }
  return rateCache;
}

const ESTIMATED_FIAT_PER_USD = {
  USD: 1,
  XOF: 605,
  NGN: 1600,
  KES: 129,
};

function convertFiatToSats(amount, currency, btcUsd) {
  const cur = (currency || "XOF").toUpperCase();
  const rateToUsd = ESTIMATED_FIAT_PER_USD[cur] || ESTIMATED_FIAT_PER_USD.XOF;
  const usdValue = Number(amount) / rateToUsd;
  const btcValue = usdValue / btcUsd;
  return Math.max(1, Math.round(btcValue * 100_000_000));
}

function deterministicOrderParser(rawText, defaultCurrency = "XOF") {
  const parts = rawText
    .split(/[,;\n+]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = [];
  for (const part of parts) {
    const explicitMoney = part.match(/(\d+(?:[.,]\d+)?)\s*(xof|cfa|ngn|kes|usd|sats?)\b/i);
    if (explicitMoney) {
      const val = Number(explicitMoney[1].replace(",", "."));
      const unit = explicitMoney[2].toUpperCase().replace("CFA", "XOF");
      const label = part.replace(explicitMoney[0], "").trim() || "Article";
      if (val > 0) {
        items.push({ name: label, amount: val, currency: unit });
        continue;
      }
    }

    const strippedWeightQty = part.replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|ml|pcs|x)\b/gi, " ").trim();
    const fallbackNum = strippedWeightQty.match(/(\d+(?:[.,]\d+)?)/);
    if (fallbackNum) {
      const val = Number(fallbackNum[1].replace(",", "."));
      const label = part.replace(fallbackNum[0], "").trim() || "Article";
      if (val > 0) {
        items.push({ name: label, amount: val, currency: defaultCurrency.toUpperCase() });
      }
    }
  }

  if (items.length === 0) {
    return {
      items: [{ name: rawText.slice(0, 60) || "Vente boutique", amount: 500, currency: defaultCurrency }],
      parserMode: "offline-fallback",
    };
  }
  return { items, parserMode: "offline-fallback" };
}

const aiRateWindow = new Map();
function checkAiRateLimit(ip) {
  const now = Date.now();
  const entry = aiRateWindow.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  entry.count += 1;
  aiRateWindow.set(ip, entry);
  return entry.count <= 20;
}

async function parseOrderWithAI(rawText, defaultCurrency = "XOF") {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return deterministicOrderParser(rawText, defaultCurrency);
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `Extract merchant order line-items and their TOTAL LINE PRICE from this African micro-merchant note (French, English, or Wolof).
Note: Weights like "2kg" or quantities are part of the item name, NOT the price. Example: "2kg riz 1300 CFA" -> {"name": "2kg riz", "amount": 1300, "currency": "XOF"}.
Default currency if unspecified: ${defaultCurrency} (CFA = XOF).
Return ONLY valid JSON:
{"items": [{"name": "string", "amount": number, "currency": "XOF|NGN|KES|USD|SATS"}]}
Input: "${rawText.slice(0, 400)}"`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!resp.ok) {
      return deterministicOrderParser(rawText, defaultCurrency);
    }

    const data = await resp.json();
    const rawOut = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawOut);
    if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
      return { items: parsed.items, parserMode: "gemini-ai" };
    }
  } catch {
    // Fallback mượt mà khi mạng yếu
  }

  return deterministicOrderParser(rawText, defaultCurrency);
}

app.get("/api/health", async (_req, res) => {
  const rates = await getLiveBtcRates();
  res.json({
    ok: true,
    service: "SokoSats Lightning POS",
    runtime: process.env.VERCEL ? "vercel-serverless" : "node-server",
    wallet: merchantWallet,
    defaultLightningAddress: process.env.DEFAULT_LIGHTNING_ADDRESS || "hello@getalby.com",
    btcUsd: rates.btcUsd,
    fiatRatesNote: "Estimated USD reference rates (XOF=605, NGN=1600, KES=129) paired with live Coinbase BTC/USD spot",
    seedCatalog: SEED_CATALOG,
  });
});

app.post("/api/ai-quote", async (req, res) => {
  const clientIp = req.ip || req.headers["x-forwarded-for"] || "unknown";
  if (!checkAiRateLimit(clientIp)) {
    return res.status(429).json({ error: "Quá nhiều yêu cầu AI, vui lòng thử lại sau 1 phút." });
  }

  const { text, currency = "XOF" } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Vui lòng nhập mô tả đơn hàng." });
  }

  const rates = await getLiveBtcRates();
  const parsed = await parseOrderWithAI(text, currency);

  let totalSats = 0;
  const enrichedItems = parsed.items.map((it) => {
    const cur = (it.currency || currency).toUpperCase();
    const sats =
      cur === "SATS" || cur === "SAT"
        ? Math.max(1, Math.round(Number(it.amount)))
        : convertFiatToSats(it.amount, cur, rates.btcUsd);
    totalSats += sats;
    return { ...it, currency: cur, sats };
  });

  res.json({
    parserMode: parsed.parserMode,
    btcUsd: rates.btcUsd,
    items: enrichedItems,
    totalSats,
  });
});

app.post("/api/lightning/invoice", async (req, res) => {
  const { lightningAddress, amountSats, memo = "SokoSats POS Payment" } = req.body || {};
  const targetLn = (lightningAddress || process.env.DEFAULT_LIGHTNING_ADDRESS || "").trim();
  const sats = Math.floor(Number(amountSats));

  if (!targetLn || !targetLn.includes("@")) {
    return res.status(400).json({
      error: "Cần nhập Lightning Address hợp lệ (ví dụ: tenban@getalby.com hoặc tenban@walletofsatoshi.com).",
    });
  }
  if (!Number.isFinite(sats) || sats < 1 || sats > 5_000_000) {
    return res.status(400).json({ error: "Số sats phải từ 1 đến 5,000,000 sats." });
  }

  try {
    const { invoice, params, successAction, validatePreimage } = await requestInvoice({
      lnUrlOrAddress: targetLn,
      tokens: sats,
      comment: String(memo).slice(0, 120),
    });

    if (!invoice || !invoice.toLowerCase().startsWith("ln")) {
      throw new Error("LNURL endpoint không trả về BOLT11 invoice hợp lệ.");
    }

    const qrSvg = await QRCode.toString(`lightning:${invoice.toUpperCase()}`, {
      type: "svg",
      margin: 1,
      width: 240,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const record = {
      id: crypto.randomUUID().slice(0, 8),
      createdAt: new Date().toISOString(),
      lightningAddress: targetLn,
      amountSats: sats,
      memo,
      bolt11: invoice,
      minSendableSats: Math.ceil((params?.min || 1000) / 1000),
      maxSendableSats: Math.floor((params?.max || 100000000) / 1000),
      hasPreimageVerifier: typeof validatePreimage === "function",
      successAction: successAction || null,
      status: "AWAITING_PAYMENT",
    };

    invoicesLedger.unshift(record);
    if (invoicesLedger.length > 50) invoicesLedger.pop();

    return res.json({
      ...record,
      qrSvg,
    });
  } catch (err) {
    return res.status(502).json({
      error: `Không thể tạo BOLT11 invoice từ LNURL (${targetLn}): ${err.message}`,
    });
  }
});

app.get("/api/invoices", (_req, res) => {
  res.json({ invoices: invoicesLedger });
});

// Chỉ mở cổng listen khi chạy trực tiếp bằng Node/Docker; khi Vercel import làm serverless handler thì export app
if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SokoSats] Running on http://0.0.0.0:${PORT}`);
    console.log(`[SokoSats] Merchant BIP84 (${merchantWallet.network}, ${merchantWallet.walletSource}): ${merchantWallet.onchainAddress}`);
  });
}

module.exports = app;