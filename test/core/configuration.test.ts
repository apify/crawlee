import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Configuration } from '@crawlee/core';

describe('Configuration - crawlee.json precedence', () => {
    let cwd: string;
    const savedEnv: Record<string, string | undefined> = {};

    function writeCrawleeJson(config: Record<string, unknown>) {
        writeFileSync(join(cwd, 'crawlee.json'), JSON.stringify(config));
    }

    function stashEnv(...names: string[]) {
        for (const name of names) {
            savedEnv[name] = process.env[name];
            delete process.env[name];
        }
    }

    beforeEach(() => {
        cwd = mkdtempSync(join(tmpdir(), 'crawlee-config-'));
        vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    });

    afterEach(() => {
        for (const [name, value] of Object.entries(savedEnv)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
            delete savedEnv[name];
        }

        rmSync(cwd, { recursive: true, force: true });
    });

    test('constructor options override crawlee.json', () => {
        stashEnv('CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS', 'CRAWLEE_DEFAULT_DATASET_ID');
        writeCrawleeJson({ persistStateIntervalMillis: 111_111, defaultDatasetId: 'from-file' });

        const config = new Configuration({ persistStateIntervalMillis: 222_222, defaultDatasetId: 'from-constructor' });

        expect(config.get('persistStateIntervalMillis')).toBe(222_222);
        expect(config.get('defaultDatasetId')).toBe('from-constructor');
    });

    test('crawlee.json applies for keys not provided in the constructor', () => {
        stashEnv('CRAWLEE_DEFAULT_DATASET_ID');
        writeCrawleeJson({ defaultDatasetId: 'from-file' });

        const config = new Configuration();

        expect(config.get('defaultDatasetId')).toBe('from-file');
    });

    test('environment variables override both crawlee.json and constructor options', () => {
        stashEnv('CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS');
        writeCrawleeJson({ persistStateIntervalMillis: 111_111 });
        process.env.CRAWLEE_PERSIST_STATE_INTERVAL_MILLIS = '333333';

        const config = new Configuration({ persistStateIntervalMillis: 222_222 });

        expect(config.get('persistStateIntervalMillis')).toBe(333_333);
    });
});
