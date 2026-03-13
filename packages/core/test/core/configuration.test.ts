import { Configuration, LogLevel, field, coerceBoolean, crawleeConfigFields } from '@crawlee/core';

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
