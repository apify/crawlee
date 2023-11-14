import { cpus } from 'node:os';
import { resolve } from 'node:path';

import isCI from 'is-ci';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

let threads: { minThreads: number; maxThreads: number } | undefined;

if (isCI) {
    // eslint-disable-next-line no-console
    console.log(`Running in CI, throttling threads to 1 test at a time`);
    threads = { minThreads: 1, maxThreads: 1 };
}

export default defineConfig({
    plugins: [tsconfigPaths()],
    esbuild: {
        target: 'es2022',
        keepNames: true,
    },
    test: {
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'cobertura'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/test/**',
            ],
        },
        restoreMocks: true,
        ...threads,
        testTimeout: 60_000,
        hookTimeout: 60_000,
        alias: [
            { find: 'crawlee', replacement: resolve(__dirname, './packages/crawlee/src') },
            { find: '@crawlee/basic', replacement: resolve(__dirname, './packages/basic-crawler/src') },
            { find: '@crawlee/browser', replacement: resolve(__dirname, './packages/browser-crawler/src') },
            { find: '@crawlee/http', replacement: resolve(__dirname, './packages/http-crawler/src') },
            { find: '@crawlee/linkedom', replacement: resolve(__dirname, './packages/linkedom-crawler/src') },
            { find: '@crawlee/jsdom', replacement: resolve(__dirname, './packages/jsdom-crawler/src') },
            { find: '@crawlee/cheerio', replacement: resolve(__dirname, './packages/cheerio-crawler/src') },
            { find: '@crawlee/playwright', replacement: resolve(__dirname, './packages/playwright-crawler/src') },
            { find: '@crawlee/puppeteer', replacement: resolve(__dirname, './packages/puppeteer-crawler/src') },
            { find: /^@crawlee\/(.*)\/(.*)$/, replacement: resolve(__dirname, './packages/$1/$2') },
            { find: /^@crawlee\/(.*)$/, replacement: resolve(__dirname, './packages/$1/src') },
            { find: /^test\/(.*)$/, replacement: resolve(__dirname, './test/$1') },
        ],
        retry: 3,
    },
});
