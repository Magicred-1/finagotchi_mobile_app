const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The shared quest engine lives OUTSIDE the app root (../shared/quest-engine).
// Watch it so Metro resolves and hot-reloads those imports.
config.watchFolders = [path.resolve(__dirname, '../shared')];

// Solana/web3.js and noble-hashes ship CommonJS builds with strict
// "exports" maps; Metro warns but falls back. Adding "cjs" to the
// recognized source extensions makes the fallback explicit and clean.
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'cjs');
config.resolver.sourceExts = ['cjs', ...config.resolver.sourceExts];

// tweetnacl requires Node's built-in 'crypto' module for randomBytes.
// Hermes/JSC don't include it, so intercept that import and point it at our
// minimal JS polyfill.
const cryptoPolyfillPath = path.resolve(__dirname, 'src/crypto-polyfill.ts');
const streamPolyfillPath = require.resolve('stream-browserify');
const wsShimPath = path.resolve(__dirname, 'src/ws-shim.ts');
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform, info) => {
    if (moduleName === 'crypto') {
        return { filePath: cryptoPolyfillPath, type: 'sourceFile' };
    }
    if (moduleName === 'stream') {
        return { filePath: streamPolyfillPath, type: 'sourceFile' };
    }
    // `ws` is a Node WebSocket library that imports Node built-ins (zlib).
    // In React Native we can use the global WebSocket instead, so redirect the
    // import to a tiny shim that re-exports it.
    if (moduleName === 'ws') {
        return { filePath: wsShimPath, type: 'sourceFile' };
    }
    if (originalResolveRequest) {
        return originalResolveRequest(context, moduleName, platform, info);
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
