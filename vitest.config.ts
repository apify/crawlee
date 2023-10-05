import { resolve } from 'node:path';

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [tsconfigPaths()],
    esbuild: {
        target: 'es2021',
        format: 'cjs',
    },
    test: {
        globals: true,
        coverage: {
            provider: 'v8',
            enabled: true,
            reporter: ['text', 'lcov', 'cobertura'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/test/**',
            ],
        },
        // minThreads: 1,
        // maxThreads: 3,
        testTimeout: 60_000,
        alias: [
            { find: '@crawlee/browser-pool', replacement: resolve(__dirname, './packages/browser-pool/src/') },
        ],
    },
});
