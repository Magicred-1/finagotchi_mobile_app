# Finagotchi Quests — architecture & operations

How deterministic daily quests flow from onchain activity to the pet's XP, and
how the Expo app binds to the standalone verification server.

## Data flow

```
Solana ──Helius webhook──▶ server POST /ingest ──▶ tx_events + user_profile (Postgres)
         (watches USER WALLETS only — never program IDs; the server appends
          each wallet on first authenticated call and drops events from
          unregistered feePayers)
                                                        ▲
app: POST /backfill {wallet} ──▶ server scans signatures, folds events, returns
                                 ActivityProfile snapshot (~1 KB JSON)
        │
        ▼
app: profileStore (AsyncStorage) ── onNewTx folds each confirmed tx locally, O(1), no network
        │
        ▼
app + server: generateDailyQuests(wallet, profile, day, questHistory)
        — same pure function, same seed, identical quest list on both sides
        │
        ▼
app: questsStore renders instantly from cache, offline; recordTx advances progress.
        On list generation the 7-day window is SEEDED from the profile's
        active-days bitmap (exact for streaks, a safe lower bound for volume
        quests) and quests already satisfied auto-enqueue their claim — a
        returning user's history counts without redoing anything.
        │
        ▼
app: claimQueue (offline-first, persisted) ──▶ server POST /verify
        │
        ▼
server: regenerates the day's list, checks real ingested events in the quest
        window, credits XP server-side only (idempotent on (wallet, questId))
```

The single source of truth for generation is the shared, zero-dependency engine
at `shared/quest-engine/`, imported by both the server and the app. The quest
list wire format is specified in `shared/quest-engine/quest-schema.json`.

## Invariants

**Determinism** (see the contract at the top of `shared/quest-engine/index.ts`):

- All timestamps are unix ms; all day math is UTC; `day` is `YYYY-MM-DD`.
- Seed = SHA256(`${wallet}|${day}`), PRNG = mulberry32, and the RNG draw order
  (habit stretch draws → explore roll → candidate index) is fixed and part of
  the protocol. Cold start (no habits) consumes no draws and returns the fixed
  cohort-default explorer quests.
- Quest id = first 16 hex chars of SHA256(`${day}:${kind}:${programId}:${index}`).
- `questHistory` passed to generation must contain only quests credited on
  PRIOR days (`{programId, kind}`). The server rebuilds it from `quest_credits`;
  the app mirrors it in `profileStore.credited`. Same history in → same list out.
- `onNewTx` is always called with `now = tx.blockTime` (never wall-clock), so a
  backfilled profile and a live-folded profile are byte-identical.

**Idempotency:**

- Server ingest and backfill fold events so re-running is a count no-op.
- XP is credited at most once per `(wallet, questId)`; a duplicate `/verify`
  replays the original credit instead of double-paying.
- The app's claim queue dedupes by `(wallet, questId)` and survives restarts.

**Trust boundary:** the app decides what to *display*; the server decides what
to *pay*. XP is only ever written server-side, and only against real ingested
transactions inside the quest window. Burst-patterned activity is flagged and
halved, never silently banned.

## Server (`../finagotchi_server/`, standalone npm project outside this repo)

The server lives in its own folder, a sibling of this repo:
`finagotchi/finagotchi_server/`. It imports the shared engine from this repo
via relative path (`../finagotchi_mobile_app/shared/quest-engine`), so the two
folders must stay siblings.

Run tests and build:

```sh
cd ../finagotchi_server && npm install && npm test && npm run build
```

Environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | production | Postgres connection string. Unset = in-memory dev DB. |
| `SOLANA_RPC_URL` | no | RPC for backfill. Defaults to public mainnet-beta. |
| `HELIUS_WEBHOOK_SECRET` | production | `Authorization` header must match on `POST /ingest`. |
| `HELIUS_API_KEY` | production | Helius Management API key — the server appends user wallets to the webhook with it. |
| `HELIUS_WEBHOOK_ID` | production | Webhook to append wallets to. Both this and the key are required for registration. |
| `MOBILE_API_KEY` | no | Optional extra bearer gate on the mobile-facing endpoints. Wallet-signed auth is the real one. |
| `PORT` | no | Listen port (default 8080). |
| `WATCHED_PROGRAMS` | no | Comma-separated program allowlist; defaults to the engine's explore candidates (Jupiter, Raydium, Orca, Marinade, Jupiter DCA). Server-side filter only — the webhook must NOT watch program IDs. |
| `BACKFILL_MAX_SIGNATURES` | no | Hard cap on signatures scanned per backfill (default 1000). |

When the secret/key variables are unset those gates are open — acceptable for
local dev only; `/backfill` and `/verify` still always require wallet-signed
auth.

## App binding (`finagotchi/src/features/quest-engine/`)

- **Base URL:** `extra.questServerUrl` in `app.json` (read via
  `Constants.expoConfig?.extra`), defaulting to `http://localhost:3000` for
  dev. Production must use an HTTPS URL — signatures and the optional bearer
  ride TLS only.
- **Wallet-signed auth (the real gate):** `/backfill` and `/verify` always
  require challenge–response auth. The client does the full dance per call,
  automatically: `POST /auth/challenge {wallet}` → `{message, nonce,
  expiresAt}` (single-use, 5 min TTL) → sign the UTF-8 bytes of `message`
  (the server builds it with the shared engine's `buildAuthMessage` — never
  hand-concatenate) → send `x-wallet-auth: <wallet>:<nonce>:<base58(sig)>`.
  On a 401 with reason `expired`/`unknown_nonce` the client retries ONCE with
  a fresh challenge; `bad_signature`/`wallet_mismatch`/`malformed` mean a
  signer or config bug and propagate as `QuestClientError` with code `'auth'`
  and the server's `authReason`.
- **Signer injection:** the quest module never touches key material. After
  wallet connect, call `setAuthSigner(signer)` where
  `signer: (message: Uint8Array, wallet: string) => Promise<Uint8Array>`
  returns a raw 64-byte ed25519 signature. `authSigner.ts` ships two
  factories: `createMwaAuthSigner(getAuthToken)` for Seeker/MWA wallets
  (reauthorizes with the cached session token inside `transact`, then
  `signMessages`) and `createDynamicAuthSigner()` for Dynamic embedded
  wallets (`dynamicClient.solana.getSigner(...).signMessage`). With no signer
  set, protected calls throw a `'signer'`-coded error.
- **MOBILE_API_KEY is now optional:** when the deployment sets it, the same
  bearer token (SecureStore key `quest_api_key` via `setApiKey()`, fallback
  `questApiKey` extra, then `EXPO_PUBLIC_QUEST_API_KEY`) is also sent on
  `/auth/challenge`. It is never logged.
- **Metro:** `finagotchi/metro.config.js` sets
  `watchFolders: [path.resolve(__dirname, '../shared')]` so the app can import
  `../../../../shared/quest-engine` (the engine lives outside the app root).
- **Sync triggers:** `startQuestSync(getWallet)` runs one pass at app open and
  again only on NetInfo offline→online transitions. There are no polling loops;
  a clearly marked TODO seam in `sync.ts` is where a daily scheduled task
  (expo-background-task / WorkManager) should be registered later.

## Claim queue behavior

`claimQueue.ts` persists `{wallet, day, questId, signature?, programId?, kind?}`
entries in AsyncStorage and flushes them sequentially:

- **Credited** → removed; `programId`/`kind`/`day` are recorded into the local
  quest history so the next day's generation dedupes exactly like the server.
  `programId`/`kind` are local bookkeeping only and are stripped from the wire
  body, which stays `{wallet, day, questId, signature?}`.
- **Definitive rejection** (`unknown_quest`, `conditions_not_met`) → removed and
  recorded in a `failed` list with the reason. Auth-impossible states land
  there too: `bad_signature`, `wallet_mismatch`, `malformed` (signer/config
  bugs no retry can fix — the client already retried `expired`/`unknown_nonce`
  once internally), and a bare 401 from the optional bearer gate.
- **Kept queued (retry next flush):** network error, timeout, 5xx, transient
  rejections (e.g. `signature_not_found` while ingest catches up), nonce
  races that survive the built-in retry, and signing failures (`'signer'`
  errors — the user may have declined the prompt; they can approve next time).
  The flush stops and the next app-open/reconnect pass retries.
