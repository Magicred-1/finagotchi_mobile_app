const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Solana/web3.js and noble-hashes ship CommonJS builds with strict
// "exports" maps; Metro warns but falls back. Adding "cjs" to the
// recognized source extensions makes the fallback explicit and clean.
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'cjs');
config.resolver.sourceExts = ['cjs', ...config.resolver.sourceExts];

// tweetnacl requires Node's built-in 'crypto' module for randomBytes.
// Hermes/JSC don't include it, so intercept that import and point it at our
// minimal JS polyfill.
const cryptoPolyfillPath = path.resolve(__dirname, 'src/crypto-polyfill.ts');
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform, info) => {
    if (moduleName === 'crypto') {
        return { filePath: cryptoPolyfillPath, type: 'sourceFile' };
    }
    if (originalResolveRequest) {
        return originalResolveRequest(context, moduleName, platform, info);
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
