import { existsSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import { resolve } from 'node:path';

import { defaultExclude, defineConfig, mergeConfig } from 'vitest/config';

// Tests that drive real browsers: ~70% of the suite's CPU time and all of its memory pressure.
// They get their own project so `maxWorkers` can be capped independently, and `sequence.groupOrder`
// keeps them from running next to the cheap tests.
const browserTests = [
    'packages/browser-pool/test/**/*.test.ts',
    'test/browser-pool/**/*.test.ts',
    'test/core/autoscaling/memory-infoV2.test.ts',
    'test/core/browser_launchers/*.test.ts',
    'test/core/crawlers/adaptive_playwright_crawler.test.ts',
    'test/core/crawlers/browser_crawler.test.ts',
    'test/core/crawlers/playwright_crawler.test.ts',
    'test/core/crawlers/puppeteer_crawler.test.ts',
    'test/core/enqueue_links/click_elements.test.ts',
    'test/core/enqueue_links/enqueue_links.test.ts',
    'test/core/playwright_utils.test.ts',
    'test/core/puppeteer_request_interception.test.ts',
    'test/core/puppeteer_utils.test.ts',
];

// vitest's default of one worker per core (minus one) is fine for cheap tests but not for tests
// holding browsers, which cost a process tree and ~1.2 GB each. Both projects scale with the
// machine, then stop where measurement stopped paying: wall time floors out on the longest single
// file, so wider runs only buy contention and flakes. Override with CRAWLEE_TEST_WORKERS /
// CRAWLEE_TEST_BROWSER_WORKERS.
const cores = availableParallelism();
const memoryGiB = totalmem() / 1024 ** 3;
const workers = (override: string | undefined, ...limits: number[]) =>
    Number(override) || Math.max(1, Math.floor(Math.min(...limits, cores - 1)));

const baseConfig = defineConfig({
    test: {
        globals: true,
        setupFiles: ['./test/vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'cobertura'],
            exclude: ['**/node_modules/**', '**/dist/**', '**/test/**'],
        },
        restoreMocks: true,
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
            { find: '@crawlee/stagehand', replacement: resolve(__dirname, './packages/stagehand-crawler/src') },
            { find: '@crawlee/utils/internal', replacement: resolve(__dirname, './packages/utils/src/internal') },
            // The generic `@crawlee/*` aliases below map specifiers to workspace package sources. They
            // exclude `@crawlee/fs-storage-native` via a negative lookahead, since it is a real external
            // (npm) dependency with no `packages/fs-storage-native` source — letting it resolve normally
            // through node_modules.
            { find: /^@crawlee\/(?!fs-storage-native)(.*)\/(.*)$/, replacement: resolve(__dirname, './packages/$1/$2') },
            { find: /^@crawlee\/(?!fs-storage-native)(.*)$/, replacement: resolve(__dirname, './packages/$1/src') },
            { find: /^test\/(.*)$/, replacement: resolve(__dirname, './test/$1') },
        ],
        retry: process.env.RETRY_TESTS ? 3 : 0,
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    exclude: [...defaultExclude, ...browserTests],
                    maxWorkers: workers(process.env.CRAWLEE_TEST_WORKERS, 8),
                },
            },
            {
                extends: true,
                test: {
                    name: 'browser',
                    include: browserTests,
                    maxWorkers: workers(process.env.CRAWLEE_TEST_BROWSER_WORKERS, 4, cores / 2, memoryGiB / 3),
                    // `test.concurrent` in the browser-pool tests multiplies the worker cap by
                    // vitest's default of 5 concurrent tests per file, each with its own browser.
                    maxConcurrency: 2,
                    sequence: { groupOrder: 1 },
                },
            },
        ],
    },
});

// Optional local override, gitignored. Resolved once per project, so it must stay side-effect free.
const localConfigPath = resolve(__dirname, './vitest.config.local.mts');
let finalConfig = baseConfig;

if (existsSync(localConfigPath)) {
    const localConfigModule = await import(localConfigPath);
    finalConfig = mergeConfig(baseConfig, localConfigModule.default);
}

export default finalConfig;
