# ⚡ SokoSats — AI Micro-Merchant POS & Real Lightning Terminal

**Built for Dakar Bitcoin Hack by BTrust (2026)** | License: **MIT**

SokoSats empowers informal street vendors and micro-merchants across West & East Africa (Dakar, Lagos, Nairobi) to accept instant **Bitcoin Lightning** payments without expensive POS hardware, high card fees, or fast internet.

---

## 1. Problem & Local Impact (Africa Context)
- **Pain point:** Small merchants in Dakar (XOF), Lagos (NGN), and Nairobi (KES) juggle fluctuating local currencies, cash change shortages, and fragmented mobile money fees.
- **Solution:** A lightweight (`< 25 KB` frontend payload, zero heavy JS frameworks) mobile-first Point-of-Sale web app where merchants type or dictate orders in **French, English, or Wolof** (e.g., *"2kg riz 1300 CFA, 1 huile 1100 CFA"*). AI parses the items, converts local currency to **satoshis** at live BTC spot rates, and generates a real **BOLT11 Lightning QR invoice** via **LNURL-pay** alongside a non-custodial **BIP84 Native SegWit** backup wallet.

---

## 2. System Architecture
```text
[Merchant Phone (2G/3G Browser)]
        │  1. Natural order text (FR / EN / Wolof) + quick catalog chips
        ▼
[Express Lightweight Server (Node 20)]
        ├──► [Gemini API] ──► Structured items + XOF/NGN/KES -> Sats conversion (with offline fallback)
        ├──► [bitcoinjs-lib + BIP39/BIP32] ──► Non-custodial BIP84 (tb1q / bc1q) merchant wallet
        └──► [lnurl-pay (LUD-06 / LUD-16)] ──► Real BOLT11 Lightning Invoice + SVG QR (<4KB)