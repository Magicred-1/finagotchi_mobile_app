// Polyfills must run before any wallet SDK code is evaluated.
// The base64 polyfill is required by Dynamic's React Native SDK.
import '@react-native-anywhere/polyfill-base64';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}
