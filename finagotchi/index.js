// Must run before any wallet/crypto code is loaded by the bundler.
import './src/polyfills';

// @ts-ignore - expo-router entry expects a module export
export * from 'expo-router/entry';
