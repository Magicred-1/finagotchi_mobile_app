const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Solana/web3.js and noble-hashes ship CommonJS builds with strict
// "exports" maps; Metro warns but falls back. Adding "cjs" to the
// recognized source extensions makes the fallback explicit and clean.
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'cjs');
config.resolver.sourceExts = ['cjs', ...config.resolver.sourceExts];

// tweetnacl (via @phantom/crypto) requires Node's built-in 'crypto' module
// for randomBytes. Hermes/JSC don't include it, so point the bare 'crypto'
// import at our minimal JS polyfill.
config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    crypto: path.resolve(__dirname, 'src/crypto-polyfill.ts'),
};

module.exports = config;
