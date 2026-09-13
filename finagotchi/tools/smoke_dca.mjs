import { DCA, Network } from '@jup-ag/dca-sdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const conn = new Connection('https://api.mainnet-beta.solana.com');
const dca = new DCA(conn, Network.MAINNET);
const user = new PublicKey('9n9aqRBgx9SKKkGoKjhWNUqe5ry4WS1XJnmxka5vMVDt');
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SPYX = new PublicKey('XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W');

const { tx, dcaPubKey } = await dca.createDcaV2({
  payer: user,
  user,
  inAmount: 50_000_000n,
  inAmountPerCycle: 10_000_000n,
  cycleSecondsApart: 604800n,
  inputMint: USDC,
  outputMint: SPYX,
  minOutAmountPerCycle: null,
  maxOutAmountPerCycle: null,
  startAt: null,
});
console.log('dcaPubKey:', dcaPubKey.toBase58());
console.log('tx instructions:', tx.instructions.length);
console.log('tx type ok:', typeof tx.serialize === 'function', 'blockhash set:', !!tx.recentBlockhash);
