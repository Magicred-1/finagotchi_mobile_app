import { vi } from 'vitest';

// The AsyncStorage jest mock (aliased in vitest.config.ts) calls jest.fn at
// module scope; shim just enough of the jest global for it to load.
(globalThis as Record<string, unknown>).jest = { fn: vi.fn };
