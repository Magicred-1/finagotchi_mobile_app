import { Transaction, Message } from '@solana/web3.js';

const sig = 'PieBeNwsuKiXxaNPmTsiK4GRVsgVo7umdHQyt4yQcuWTtifiveWtH9BLvjSNa2qcpp9w9YKB4B4kakwhW3YiZ44';
const res = await fetch('https://api.mainnet-beta.solana.com', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'base64', maxSupportedTransactionVersion: 0 }] }),
});
const raw = (await res.json()).result.transaction[0];
const tx = Transaction.from(Buffer.from(raw, 'base64'));
const actualKeys = tx.compileMessage().accountKeys.map(k => k.toBase58());
const canonical = Message.compile({ instructions: tx.instructions, payerKey: tx.feePayer });
const canonicalKeys = canonical.accountKeys.map(k => k.toBase58());
console.log('order == canonical:', JSON.stringify(actualKeys) === JSON.stringify(canonicalKeys));
console.log('actual   :', actualKeys.map(k=>k.slice(0,6)).join(' '));
console.log('canonical:', canonicalKeys.map(k=>k.slice(0,6)).join(' '));
