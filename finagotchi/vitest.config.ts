import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts'],
        setupFiles: ['vitest.setup.ts'],
    },
    resolve: {
        alias: [
            {
                // PlanStore statically imports AsyncStorage; swap in the
                // package's in-memory mock (jest.fn is shimmed in the setup).
                find: /^@react-native-async-storage\/async-storage$/,
                replacement:
                    '@react-native-async-storage/async-storage/jest/async-storage-mock',
            },
        ],
    },
});
