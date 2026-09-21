/**
 * Metro/Webpack shim for `ws` on React Native.
 *
 * The `ws` package's Node build imports Node built-ins (zlib) that do not
 * exist in React Native. React Native already provides a global WebSocket, so
 * this module exposes the native WebSocket as the `ws` export.
 */
export const WebSocket = globalThis.WebSocket;
export default globalThis.WebSocket;
