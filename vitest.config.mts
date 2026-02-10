import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import isCI from 'is-ci';
import { defineConfig, mergeConfig } from 'vitest/config';

let threads: { minThreads: number; maxThreads: number } | undefined;

if (isCI) {
    console.log(`Running in CI, throttling threads to 1 test at a time`);
    threads = { minThreads: 1, maxThreads: 1 };
}

const baseConfig = defineConfig({
    esbuild: {
        target: 'es2022',
        keepNames: true,
    },
    test: {
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'cobertura'],
            exclude: ['**/node_modules/**', '**/dist/**', '**/test/**'],
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
        retry: process.env.RETRY_TESTS ? 3 : 0,
    },
});

// Check for local config override
const localConfigPath = resolve(__dirname, './vitest.config.local.mts');
let finalConfig = baseConfig;

if (existsSync(localConfigPath)) {
    const localConfigModule = await import(localConfigPath);
    const localConfig = localConfigModule.default;
    console.log(`Applying local vitest config overrides`);
    finalConfig = mergeConfig(baseConfig, localConfig);
}

export default finalConfig;
