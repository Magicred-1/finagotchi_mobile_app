/**
 * Probe: what deposit transaction shapes does Jupiter Trigger v2 actually
 * accept for POST /orders/dca? Runs the real flow with a throwaway,
 * unfunded keypair — validation ("accounts modified", format errors) happens
 * before any funds move, so the answers are definitive without mainnet USDC.
 *
 *   A) v0 exactly as crafted, signed (the docs flow)  — control
 *   B) faithful legacy conversion (LUTs resolved in v0 order), signed
 *
 * Usage: node tools/dca_probe.mjs [v0|legacy|both]
 */
import { Buffer } from 'buffer';
import fs from 'fs';
import {
  Keypair,
  Message,
  PublicKey,
  VersionedTransaction,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const mode = process.argv[2] ?? 'both';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const API_KEY = env.EXPO_PUBLIC_JUPITER_API_KEY;
if (!API_KEY) throw new Error('EXPO_PUBLIC_JUPITER_API_KEY missing from .env');

const BASE = 'https://api.jup.ag/trigger/v2';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const MAINNET_RPC =
  env.EXPO_PUBLIC_JUPITER_RPC ?? 'https://api.mainnet-beta.solana.com';

const wallet = env.BS58_PRIVATE_KEY
  ? Keypair.fromSecretKey(bs58.decode(env.BS58_PRIVATE_KEY))
  : Keypair.generate();
const owner = wallet.publicKey.toBase58();
console.log(
  env.BS58_PRIVATE_KEY ? 'using funded wallet:' : 'probe wallet (unfunded):',
  owner
);

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function authenticate() {
  const { challenge } = (await post('/auth/challenge', {
    walletPubkey: owner,
    type: 'message',
  })).data;
  const signature = nacl.sign.detached(
    new TextEncoder().encode(challenge),
    wallet.secretKey
  );
  const verified = await post('/auth/verify', {
    type: 'message',
    walletPubkey: owner,
    signature: bs58.encode(signature),
  });
  return verified.data.token;
}

async function get(path, token) {
  const res = await fetch(BASE + path, {
    headers: {
      'x-api-key': API_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function craft(token) {
  const res = await post(
    '/deposit/craft',
    {
      inputMint: USDC,
      outputMint: SOL_MINT,
      userAddress: owner,
      amount: '20000000', // 20 USDC -> 2 x 10 rounds
      orderType: 'dca',
    },
    token
  );
  if (res.status !== 200) throw new Error(`craft failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function submitOrder(token, requestId, depositSignedTx) {
  return post(
    '/orders/dca',
    {
      depositRequestId: requestId,
      depositSignedTx,
      userPubkey: owner,
      inputMint: USDC,
      outputMint: SOL_MINT,
      inputAmount: '20000000',
      orderCount: 2,
      intervalSeconds: 86400,
      orderType: 'time_based',
    },
    token
  );
}

function rpc(method, params) {
  return fetch(MAINNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((r) => r.json());
}

async function resolveLookupTables(tx) {
  const tables = [];
  for (const lookup of tx.message.addressTableLookups) {
    const res = await rpc('getAccountInfo', [
      lookup.accountKey.toBase58(),
      { encoding: 'base64' },
    ]);
    const raw = res?.result?.value?.data?.[0];
    if (!raw) throw new Error(`LUT ${lookup.accountKey.toBase58()} not found`);
    tables.push(
      new AddressLookupTableAccount({
        key: lookup.accountKey,
        state: AddressLookupTableAccount.deserialize(
          new Uint8Array(Buffer.from(raw, 'base64'))
        ),
      })
    );
  }
  return tables;
}

/** v0 message -> legacy Message with identical resolved account order. */
async function toLegacyMessage(tx) {
  const tables = await resolveLookupTables(tx);
  const accountKeys = [...tx.message.staticAccountKeys];
  let lookupReadonly = 0;
  for (const lookup of tx.message.addressTableLookups) {
    const table = tables.find((t) => t.key.equals(lookup.accountKey));
    accountKeys.push(...lookup.writableIndexes.map((i) => table.state.addresses[i]));
    accountKeys.push(...lookup.readonlyIndexes.map((i) => table.state.addresses[i]));
    lookupReadonly += lookup.readonlyIndexes.length;
  }
  const h = tx.message.header;
  return new Message({
    header: {
      numRequiredSignatures: h.numRequiredSignatures,
      numReadonlySignedAccounts: h.numReadonlySignedAccounts,
      numReadonlyUnsignedAccounts:
        h.numReadonlyUnsignedAccounts + lookupReadonly,
    },
    accountKeys: accountKeys.map((k) => k.toBase58()),
    recentBlockhash: tx.message.recentBlockhash,
    instructions: tx.message.compiledInstructions.map((ci) => ({
      programIdIndex: ci.programIdIndex,
      accounts: ci.accountKeyIndexes,
      data: bs58.encode(ci.data),
    })),
  });
}

/** Legacy wire format: shortvec sig count + 64B slots + message bytes. */
function legacyWire(messageBytes, numSigners) {
  const wire = Buffer.alloc(1 + 64 * numSigners + messageBytes.length);
  wire[0] = numSigners;
  Buffer.from(messageBytes).copy(wire, 1 + 64 * numSigners);
  return wire;
}

const token = await authenticate();
console.log('authed');

const vault = await get('/vault', token);
if (vault.status === 404) {
  const registered = await get('/vault/register', token);
  console.log('vault registered ->', registered.status);
} else {
  console.log('vault ->', vault.status);
}

if (mode === 'v0' || mode === 'both') {
  const c = await craft(token);
  const tx = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(c.transaction, 'base64'))
  );
  console.log(
    `[v0] lookups=${tx.message.addressTableLookups.length} staticKeys=${tx.message.staticAccountKeys.length} signers=${tx.message.header.numRequiredSignatures}`
  );
  tx.sign([wallet]);
  const res = await submitOrder(
    token,
    c.requestId,
    Buffer.from(tx.serialize()).toString('base64')
  );
  console.log('[v0] submit ->', res.status, JSON.stringify(res.data));
}

if (mode === 'legacy' || mode === 'both') {
  const c = await craft(token);
  const tx = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(c.transaction, 'base64'))
  );
  const message = await toLegacyMessage(tx);
  const messageBytes = message.serialize();
  const numSigners = message.header.numRequiredSignatures;
  const wire = legacyWire(messageBytes, numSigners);
  const signerIndex = message.accountKeys
    .slice(0, numSigners)
    .findIndex((k) => k.toBase58() === owner);
  if (signerIndex < 0) throw new Error('wallet not a required signer');
  const sig = nacl.sign.detached(new Uint8Array(messageBytes), wallet.secretKey);
  Buffer.from(sig).copy(wire, 1 + 64 * signerIndex);
  const res = await submitOrder(
    token,
    c.requestId,
    wire.toString('base64')
  );
  console.log('[legacy] submit ->', res.status, JSON.stringify(res.data));
}

if (mode === 'order') {
  const c = await craft(token);
  const tx = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(c.transaction, 'base64'))
  );
  const { TransactionMessage, Transaction } = await import('@solana/web3.js');
  const decompiled = TransactionMessage.decompile(tx.message);
  const canonical = new Transaction({
    feePayer: tx.message.staticAccountKeys[0],
    recentBlockhash: tx.message.recentBlockhash,
  }).add(...decompiled.instructions);
  const canonicalMsg = canonical.compileMessage().serialize();
  const craftedMsg = tx.message.serialize();
  // v0 message = 0x80 prefix + same layout as legacy
  const craftedAsLegacy = Buffer.from(craftedMsg).subarray(1);
  console.log(
    '[order] canonical == crafted order:',
    Buffer.from(canonicalMsg).equals(craftedAsLegacy)
  );
  console.log(
    '[order] crafted keys:',
    tx.message.staticAccountKeys.map((k) => k.toBase58().slice(0, 8)).join(' ')
  );
}

if (mode === 'canonical') {
  const c = await craft(token);
  const tx = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(c.transaction, 'base64'))
  );
  const { TransactionMessage, Transaction } = await import('@solana/web3.js');
  const decompiled = TransactionMessage.decompile(tx.message);
  const canonical = new Transaction({
    feePayer: tx.message.staticAccountKeys[0],
    recentBlockhash: tx.message.recentBlockhash,
  }).add(...decompiled.instructions);
  canonical.sign(wallet);
  const res = await submitOrder(
    token,
    c.requestId,
    canonical
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64')
  );
  console.log('[canonical] submit ->', res.status, JSON.stringify(res.data));
}

if (mode === 'selfbuilt') {
  const c = await craft(token);
  console.log('[selfbuilt] craft receiver:', c.receiverAddress, 'ita:', c.inputTokenAccount);
  const {
    Transaction,
    TransactionInstruction,
    PublicKey: PK,
  } = await import('@solana/web3.js');
  const owner2 = wallet.publicKey;
  // SPL Token Transfer (ix 3) built by hand — no spl-token dependency.
  const TOKEN_PROGRAM = new PK('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ATA_PROGRAM = new PK('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const usdcMint = new PK(USDC);
  const [fromAta] = PK.findProgramAddressSync(
    [owner2.toBuffer(), TOKEN_PROGRAM.toBuffer(), usdcMint.toBuffer()],
    ATA_PROGRAM
  );
  const toAta = new PK(c.inputTokenAccount ?? c.receiverAddress);
  const data = Buffer.alloc(9);
  data[0] = 3;
  data.writeBigUInt64LE(20_000_000n, 1);
  const transferIx = {
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: fromAta, isSigner: false, isWritable: true },
      { pubkey: toAta, isSigner: false, isWritable: true },
      { pubkey: owner2, isSigner: true, isWritable: false },
    ],
    data,
  };
  const bh = (await rpc('getLatestBlockhash', [{ commitment: 'finalized' }])).result
    .value.blockhash;
  const tx2 = new Transaction({ feePayer: owner2, recentBlockhash: bh }).add(transferIx);
  tx2.sign(wallet);
  const res = await submitOrder(
    token,
    c.requestId,
    tx2.serialize().toString('base64')
  );
  console.log('[selfbuilt] submit ->', res.status, JSON.stringify(res.data));
}
