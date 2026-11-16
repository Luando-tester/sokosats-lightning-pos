const assert = require("assert");
const bitcoin = require("bitcoinjs-lib");
const ecc = require("tiny-secp256k1");
const { BIP32Factory } = require("bip32");
const bip39 = require("bip39");
const { requestInvoice } = require("lnurl-pay");

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

async function runSmokeTest() {
  console.log("=== 1. Testing Non-Custodial BIP84 Bitcoin Wallet Derivation ===");
  const mnemonic = bip39.generateMnemonic(128);
  assert.ok(bip39.validateMnemonic(mnemonic), "Invalid BIP39 mnemonic");

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, bitcoin.networks.testnet);
  const child = root.derivePath("m/84'/1'/0'/0/0");
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network: bitcoin.networks.testnet,
  });
  assert.ok(address && address.startsWith("tb1q"), `Unexpected testnet address: ${address}`);
  console.log("PASS -> Testnet BIP84 Address:", address);

  console.log("\n=== 2. Testing Real LNURL-Pay BOLT11 Invoice Generation ===");
  const testLnAddress = process.env.DEFAULT_LIGHTNING_ADDRESS || "hello@getalby.com";
  try {
    const { invoice } = await requestInvoice({
      lnUrlOrAddress: testLnAddress,
      tokens: 10,
      comment: "SokoSats smoke-test",
    });
    assert.ok(invoice && invoice.toLowerCase().startsWith("lnbc"), "Invalid BOLT11 invoice");
    console.log(`PASS -> Real BOLT11 generated from ${testLnAddress} (${invoice.slice(0, 32)}...)`);
  } catch (err) {
    console.error(`WARN -> LNURL network call failed (${err.message}). Check internet access.`);
    process.exitCode = 1;
  }
}

runSmokeTest();