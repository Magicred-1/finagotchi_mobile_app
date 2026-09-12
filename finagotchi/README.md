# Finagotchi

Mobile companion app for the Finagotchi ESP32-S3 device. Renders the same
procedural blob pet as the firmware (same TypeScript engine, `src/engine/`),
connects to the device over BLE, and keeps app and device in sync.

## Running

BLE does **not** work in Expo Go — you need a development build:

```sh
pnpm install
npx expo prebuild
npx expo run:ios      # or: npx expo run:android
```

`app.json` already declares the BLE permissions (iOS
`NSBluetoothAlwaysUsageDescription` via the `react-native-ble-plx` config
plugin; Android 12+ `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`, location on older
Android — requested at runtime).

## BLE layer (`src/features/ble/`)

- `useBle.ts` — scan → filter by the Finagotchi service UUID → connect →
  discover → subscribe. Exposes `sendCommand(cmd)` with a serialized write
  queue (writes never overlap; `;`-separated commands are sent one per
  write). Negotiates MTU 185 on Android. Unexpected disconnects trigger
  auto-reconnect with exponential backoff; `reconnect()` retries manually.
- `types.ts` — UUIDs, status,
  `<stage>:<streak>:<mood>:<item>:<points>:<happy>` parser, hook interface.
- `sync.ts` — mirrors state between the app engine and the device
  (`useDeviceSync`): pushes a `stage:`/`mood:`/`item:`/`points:`/`happy:`/
  `streak:` snapshot on every connect once both persisted stores have
  hydrated (happiness is RAM-only on the device, so stats must be re-shared
  each time), writes `stage:` on local evolution
  and `points:`/`happy:`/`streak:` (debounced 500 ms) when the app's
  balance/happiness/streak change, and applies device notifications back
  into the local engine. Notifications inside a short grace window after
  connect/snapshot are ignored: they carry the firmware's pre-push state or
  echoes of our own writes, not device-initiated changes.

## Interactions

- **Drag on the pet** — steers the gaze (±30° yaw / ±25° pitch), writes
  `look:<yaw>,<pitch>` throttled to ~10 Hz; release sends `look:off`.
- **Mood picker / Evolve** — in the device sheet (bluetooth icon in the top
  bar). Mood chips write `mood:<n>` (index into `engine/expressions.ts`);
  Evolve advances the stage and writes `stage:<name>`.
