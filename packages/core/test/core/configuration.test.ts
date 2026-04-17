import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { coerceBoolean, Configuration, crawleeConfigFields, field, LogLevel } from '@crawlee/core';

describe('Configuration', () => {
    const envBackup: Record<string, string | undefined> = {};

    function setEnv(key: string, value: string) {
        envBackup[key] ??= process.env[key];
        process.env[key] = value;
    }

    beforeEach(() => {
        // Clean all CRAWLEE_ env vars so tests are isolated
        for (const key of Object.keys(process.env)) {
            if (key.startsWith('CRAWLEE_')) {
                envBackup[key] ??= process.env[key];
                delete process.env[key];
            }
        }
    });

    afterEach(() => {
        // Restore env vars
        for (const [key, val] of Object.entries(envBackup)) {
            if (val === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = val;
            }
        }
    });

    describe('defaults', () => {
        it('returns schema defaults when nothing is set', () => {
            const config = new Configuration();
            expect(config.defaultDatasetId).toBe('default');
            expect(config.defaultKeyValueStoreId).toBe('default');
            expect(config.defaultRequestQueueId).toBe('default');
            expect(config.inputKey).toBe('INPUT');
            expect(config.headless).toBe(true);
            expect(config.xvfb).toBe(false);
            expect(config.purgeOnStart).toBe(true);
            expect(config.persistStorage).toBe(true);
            expect(config.maxUsedCpuRatio).toBe(0.95);
            expect(config.availableMemoryRatio).toBe(0.25);
            expect(config.persistStateIntervalMillis).toBe(60_000);
            expect(config.systemInfoIntervalMillis).toBe(1_000);
        });

        it('returns undefined for optional fields with no default', () => {
            const config = new Configuration();
            expect(config.memoryMbytes).toBeUndefined();
            expect(config.chromeExecutablePath).toBeUndefined();
            expect(config.defaultBrowserPath).toBeUndefined();
            expect(config.disableBrowserSandbox).toBeUndefined();
            expect(config.containerized).toBeUndefined();
            expect(config.logLevel).toBeUndefined();
        });
    });

    describe('priority: constructor > env > defaults', () => {
        it('constructor options override env vars', () => {
            setEnv('CRAWLEE_HEADLESS', 'true');
            const config = new Configuration({ headless: false });
            expect(config.headless).toBe(false);
        });

        it('env vars override defaults', () => {
            setEnv('CRAWLEE_HEADLESS', 'false');
            const config = new Configuration();
            expect(config.headless).toBe(false);
        });

        it('constructor options override defaults', () => {
            const config = new Configuration({ persistStateIntervalMillis: 30_000 });
            expect(config.persistStateIntervalMillis).toBe(30_000);
        });

        it('constructor options override env vars for string fields', () => {
            setEnv('CRAWLEE_DEFAULT_DATASET_ID', 'from-env');
            const config = new Configuration({ defaultDatasetId: 'from-constructor' });
            expect(config.defaultDatasetId).toBe('from-constructor');
        });

        it('constructor options override env vars for number fields', () => {
            setEnv('CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS', '99999');
            const config = new Configuration({ persistStateIntervalMillis: 10_000 });
            expect(config.persistStateIntervalMillis).toBe(10_000);
        });
    });

    describe('env var coercion', () => {
        it('coerces boolean env vars', () => {
            setEnv('CRAWLEE_HEADLESS', 'false');
            expect(new Configuration().headless).toBe(false);

            setEnv('CRAWLEE_HEADLESS', '0');
            expect(new Configuration().headless).toBe(false);

            setEnv('CRAWLEE_HEADLESS', 'true');
            expect(new Configuration().headless).toBe(true);

            setEnv('CRAWLEE_HEADLESS', '1');
            expect(new Configuration().headless).toBe(true);
        });

        it('treats empty-string boolean env var as false', () => {
            setEnv('CRAWLEE_HEADLESS', '');
            expect(new Configuration().headless).toBe(false);

            setEnv('CRAWLEE_PURGE_ON_START', '');
            expect(new Configuration().purgeOnStart).toBe(false);
        });

        it('coerces empty-string number env var to 0', () => {
            setEnv('CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS', '');
            expect(new Configuration().persistStateIntervalMillis).toBe(0);

            setEnv('CRAWLEE_MEMORY_MBYTES', '');
            expect(new Configuration().memoryMbytes).toBe(0);
        });

        it('coerces number env vars', () => {
            setEnv('CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS', '30000');
            expect(new Configuration().persistStateIntervalMillis).toBe(30_000);

            setEnv('CRAWLEE_MEMORY_MBYTES', '512');
            expect(new Configuration().memoryMbytes).toBe(512);
        });

        it('coerces log level from string name', () => {
            setEnv('CRAWLEE_LOG_LEVEL', 'DEBUG');
            expect(new Configuration().logLevel).toBe(LogLevel.DEBUG);
        });

        it('coerces log level from numeric string', () => {
            setEnv('CRAWLEE_LOG_LEVEL', '5');
            expect(new Configuration().logLevel).toBe(LogLevel.DEBUG);
        });

        it('coerces log level case-insensitively', () => {
            setEnv('CRAWLEE_LOG_LEVEL', 'info');
            expect(new Configuration().logLevel).toBe(LogLevel.INFO);
        });
    });

    describe('direct property access', () => {
        it('accesses all fields as properties', () => {
            const config = new Configuration({
                headless: false,
                defaultDatasetId: 'my-dataset',
                persistStateIntervalMillis: 5_000,
            });
            expect(config.headless).toBe(false);
            expect(config.defaultDatasetId).toBe('my-dataset');
            expect(config.persistStateIntervalMillis).toBe(5_000);
        });
    });

    describe('immutability', () => {
        it('throws TypeError when assigning to a config property', () => {
            const config = new Configuration();
            expect(() => {
                (config as any).headless = false;
            }).toThrow(TypeError);
            expect(() => {
                (config as any).headless = false;
            }).toThrow('Configuration is immutable');
        });
    });

    describe('schema validation of constructor options', () => {
        it('validates and coerces constructor options through the schema', () => {
            // Pass a string where a number is expected — schema should coerce it
            const config = new Configuration({ memoryMbytes: '512' as any });
            expect(config.memoryMbytes).toBe(512);
            expect(typeof config.memoryMbytes).toBe('number');
        });

        it('validates boolean constructor options through the schema', () => {
            // Pass a string where a boolean is expected — schema should coerce it
            const config = new Configuration({ headless: '0' as any });
            expect(config.headless).toBe(false);
        });

        it('rejects invalid constructor options via schema', () => {
            // Pass a completely invalid value — schema should throw
            expect(() => {
                const config = new Configuration({ memoryMbytes: 'not-a-number' as any });
                // Access the property to trigger resolution
                void config.memoryMbytes;
            }).toThrow();
        });
    });

    describe('crawlee.json file loading', () => {
        const crawleeJsonPath = join(process.cwd(), 'crawlee.json');
        let fileCreated = false;

        afterEach(() => {
            if (fileCreated) {
                try {
                    unlinkSync(crawleeJsonPath);
                } catch {
                    /* ignore */
                }
                fileCreated = false;
            }
        });

        it('loads values from crawlee.json', () => {
            writeFileSync(crawleeJsonPath, JSON.stringify({ defaultDatasetId: 'from-file' }));
            fileCreated = true;

            const config = new Configuration();
            expect(config.defaultDatasetId).toBe('from-file');
        });

        it('constructor options override crawlee.json', () => {
            writeFileSync(crawleeJsonPath, JSON.stringify({ defaultDatasetId: 'from-file' }));
            fileCreated = true;

            const config = new Configuration({ defaultDatasetId: 'from-constructor' });
            expect(config.defaultDatasetId).toBe('from-constructor');
        });

        it('env vars override crawlee.json', () => {
            writeFileSync(crawleeJsonPath, JSON.stringify({ headless: false }));
            fileCreated = true;
            setEnv('CRAWLEE_HEADLESS', 'true');

            const config = new Configuration();
            expect(config.headless).toBe(true);
        });

        it('validates and coerces crawlee.json values through the schema', () => {
            // JSON numbers are already numbers, but string values should be coerced
            writeFileSync(crawleeJsonPath, JSON.stringify({ memoryMbytes: '256' }));
            fileCreated = true;

            const config = new Configuration();
            expect(config.memoryMbytes).toBe(256);
            expect(typeof config.memoryMbytes).toBe('number');
        });

        it('handles missing crawlee.json gracefully', () => {
            // No file created — should fall through to defaults
            const config = new Configuration();
            expect(config.defaultDatasetId).toBe('default');
        });

        it('handles malformed crawlee.json gracefully', () => {
            writeFileSync(crawleeJsonPath, 'not valid json{{{');
            fileCreated = true;

            const config = new Configuration();
            expect(config.defaultDatasetId).toBe('default');
        });
    });

    describe('subclass field registration', () => {
        it('subclass can define additional fields via static fields override', () => {
            const extendedFields = {
                ...crawleeConfigFields,
                customFlag: field(coerceBoolean.default(false), 'MY_CUSTOM_FLAG'),
            };

            class ExtendedConfig extends Configuration {
                protected static override fields = extendedFields;
            }

            const config = new ExtendedConfig();
            expect((config as any).customFlag).toBe(false);

            setEnv('MY_CUSTOM_FLAG', 'true');
            const config2 = new ExtendedConfig();
            expect((config2 as any).customFlag).toBe(true);
        });
    });
});
