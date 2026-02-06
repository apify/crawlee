import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Configuration } from '@crawlee/core';

describe('Configuration priority', () => {
    const originalEnv = { ...process.env };
    const crawleeJsonPath = join(process.cwd(), 'crawlee.json');
    let createdCrawleeJson = false;

    beforeEach(() => {
        Configuration.resetGlobalState();
    });

    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
        Configuration.resetGlobalState();

        // Clean up crawlee.json if we created it
        if (createdCrawleeJson) {
            try {
                unlinkSync(crawleeJsonPath);
            } catch {
                // ignore
            }
            createdCrawleeJson = false;
        }
    });

    describe('constructor options take precedence over env vars', () => {
        test('boolean option: headless', () => {
            process.env.CRAWLEE_HEADLESS = 'true';
            const config = new Configuration({ headless: false });

            expect(config.get('headless')).toBe(false);
        });

        test('string option: defaultDatasetId', () => {
            process.env.CRAWLEE_DEFAULT_DATASET_ID = 'env-dataset';
            const config = new Configuration({ defaultDatasetId: 'constructor-dataset' });

            expect(config.get('defaultDatasetId')).toBe('constructor-dataset');
        });

        test('integer option: memoryMbytes', () => {
            process.env.CRAWLEE_MEMORY_MBYTES = '1024';
            const config = new Configuration({ memoryMbytes: 2048 });

            expect(config.get('memoryMbytes')).toBe(2048);
        });

        test('integer option: persistStateIntervalMillis', () => {
            process.env.CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS = '30000';
            const config = new Configuration({ persistStateIntervalMillis: 90000 });

            expect(config.get('persistStateIntervalMillis')).toBe(90000);
        });
    });

    describe('env vars take precedence over defaults', () => {
        test('env var overrides default headless value', () => {
            process.env.CRAWLEE_HEADLESS = 'false';
            const config = new Configuration();

            expect(config.get('headless')).toBe(false);
        });

        test('env var overrides default persistStateIntervalMillis', () => {
            process.env.CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS = '120000';
            const config = new Configuration();

            expect(config.get('persistStateIntervalMillis')).toBe(120000);
        });
    });

    describe('defaults are used when no other value is provided', () => {
        test('uses default headless value', () => {
            delete process.env.CRAWLEE_HEADLESS;
            const config = new Configuration();

            expect(config.get('headless')).toBe(true);
        });

        test('uses default persistStateIntervalMillis', () => {
            delete process.env.CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS;
            const config = new Configuration();

            expect(config.get('persistStateIntervalMillis')).toBe(60_000);
        });

        test('uses default defaultDatasetId', () => {
            delete process.env.CRAWLEE_DEFAULT_DATASET_ID;
            const config = new Configuration();

            expect(config.get('defaultDatasetId')).toBe('default');
        });
    });

    describe('env vars are used when constructor option is not provided', () => {
        test('uses env var when constructor does not specify the option', () => {
            process.env.CRAWLEE_HEADLESS = 'false';
            // Constructor provides a different option, not headless
            const config = new Configuration({ persistStateIntervalMillis: 90000 });

            // headless should come from env var since not in constructor
            expect(config.get('headless')).toBe(false);
            // persistStateIntervalMillis should come from constructor
            expect(config.get('persistStateIntervalMillis')).toBe(90000);
        });
    });

    describe('crawlee.json integration', () => {
        test('constructor options override crawlee.json', () => {
            writeFileSync(crawleeJsonPath, JSON.stringify({ headless: true, persistStateIntervalMillis: 30000 }));
            createdCrawleeJson = true;

            const config = new Configuration({ headless: false });

            expect(config.get('headless')).toBe(false);
            // persistStateIntervalMillis not in constructor, should come from crawlee.json
            expect(config.get('persistStateIntervalMillis')).toBe(30000);
        });

        test('env vars override crawlee.json when constructor option not provided', () => {
            writeFileSync(crawleeJsonPath, JSON.stringify({ headless: true }));
            createdCrawleeJson = true;
            process.env.CRAWLEE_HEADLESS = 'false';

            const config = new Configuration();

            expect(config.get('headless')).toBe(false);
        });

        test('crawlee.json values are used when no env var or constructor option', () => {
            writeFileSync(crawleeJsonPath, JSON.stringify({ persistStateIntervalMillis: 45000 }));
            createdCrawleeJson = true;
            delete process.env.CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS;

            const config = new Configuration();

            expect(config.get('persistStateIntervalMillis')).toBe(45000);
        });

        test('full priority chain: constructor > env > crawlee.json > defaults', () => {
            writeFileSync(
                crawleeJsonPath,
                JSON.stringify({
                    headless: true,
                    persistStateIntervalMillis: 45000,
                    defaultDatasetId: 'json-dataset',
                    inputKey: 'JSON_INPUT',
                }),
            );
            createdCrawleeJson = true;

            process.env.CRAWLEE_HEADLESS = 'false';
            process.env.CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS = '30000';
            delete process.env.CRAWLEE_DEFAULT_DATASET_ID;
            delete process.env.CRAWLEE_INPUT_KEY;
            delete process.env.CRAWLEE_PURGE_ON_START;

            const config = new Configuration({
                headless: true, // Should win over env var 'false'
            });

            // constructor wins over env var
            expect(config.get('headless')).toBe(true);
            // env var wins over crawlee.json (no constructor option for this)
            expect(config.get('persistStateIntervalMillis')).toBe(30000);
            // crawlee.json wins over default (no constructor or env var)
            expect(config.get('defaultDatasetId')).toBe('json-dataset');
            expect(config.get('inputKey')).toBe('JSON_INPUT');
            // default is used (no constructor, env var, or crawlee.json)
            expect(config.get('purgeOnStart')).toBe(true);
        });
    });

    describe('edge cases', () => {
        test('explicitly setting option to false overrides env var true', () => {
            process.env.CRAWLEE_PURGE_ON_START = 'true';
            const config = new Configuration({ purgeOnStart: false });

            expect(config.get('purgeOnStart')).toBe(false);
        });

        test('explicitly setting option to 0 overrides env var', () => {
            process.env.CRAWLEE_MEMORY_MBYTES = '1024';
            const config = new Configuration({ memoryMbytes: 0 });

            expect(config.get('memoryMbytes')).toBe(0);
        });

        test('explicitly setting option to empty string overrides env var', () => {
            process.env.CRAWLEE_DEFAULT_DATASET_ID = 'env-dataset';
            const config = new Configuration({ defaultDatasetId: '' });

            expect(config.get('defaultDatasetId')).toBe('');
        });
    });
});
