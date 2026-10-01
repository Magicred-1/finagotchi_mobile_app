// True app entry: polyfills MUST evaluate before any expo-router route
// module. Routes evaluate in context order ('(' sorts before '_'), so
// app/(tabs)/index.tsx's wallet-SDK import chain (Sidebar → useWallet →
// dynamicWalletPicker → newDynamicClient → @noble/hashes) would otherwise
// capture globalThis.crypto while it is still undefined — a permanent
// "crypto.getRandomValues must be defined" at every later signing call.
import './src/polyfills';
import 'expo-router/entry';
