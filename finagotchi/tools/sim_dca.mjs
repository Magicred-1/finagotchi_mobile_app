import { DCA, Network } from '@jup-ag/dca-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://api.mainnet-beta.solana.com';
const conn = new Connection(RPC);
const dca = new DCA(conn, Network.MAINNET);
const user = new PublicKey('9n9aqRBgx9SKKkGoKjhWNUqe5ry4WS1XJnmxka5vMVDt');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SPYX = new PublicKey('XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W');

const { tx, dcaPubKey } = await dca.createDcaV2({
  payer: user, user,
  inAmount: 50_000_000n, inAmountPerCycle: 10_000_000n,
  cycleSecondsApart: 604800n,
  inputMint: USDC, outputMint: SPYX,
  minOutAmountPerCycle: null, maxOutAmountPerCycle: null, startAt: null,
});
const { blockhash } = await conn.getLatestBlockhash();
tx.recentBlockhash = blockhash;
tx.feePayer = user;
console.log('dcaPubKey:', dcaPubKey.toBase58());
console.log('instructions:', tx.instructions.length);
tx.instructions.forEach((ix, i) => console.log(`  [${i}] program ${ix.programId.toBase58()} accounts ${ix.keys.length}`));

const res = await fetch(RPC, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'simulateTransaction',
    params: [tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
      { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: false }],
  }),
});
const sim = (await res.json()).result?.value;
console.log('sim err:', JSON.stringify(sim?.err));
console.log('logs:', (sim?.logs ?? []).join('\n'));

// debug: what blockhash is inside the serialized tx?
const wire = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
const decoded = (await import('@solana/web3.js')).Transaction.from(wire);
console.log('set blockhash:     ', blockhash);
console.log('tx.recentBlockhash:', tx.recentBlockhash);
console.log('nonceInfo:         ', tx.nonceInfo);
console.log('wire blockhash:    ', decoded.recentBlockhash);
