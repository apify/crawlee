import { join } from 'node:path';

import type { StatisticPersistedState } from '@crawlee/basic';
import { URL_NO_COMMAS_REGEX } from '@crawlee/utils/internal';
import { defineActor, type RunOutcome, type RunTestResult } from 'apify-test-tools';
import { ActorSource, inlineMain } from 'apify-test-tools/ad-hoc';
import { describe, inject } from 'vitest';

type ScenarioOptions = Pick<Parameters<typeof defineActor>[1], 'memory' | 'permissions' | 'env'> & { image?: string };

/**
 * The Actor `crawlee-e2e-<label>` whose entry point is `main`, a top-level function of the test file at `filename`,
 * built from the image's template and pinned to the packed workspace packages. `main` is read from disk and transpiled
 * on its own, so it must be self-contained: dependencies via `await import()`, no references to the rest of the test
 * file.
 */
export const scenario = (
    label: string,
    filename: string,
    main: () => unknown,
    { image = 'node', ...options }: ScenarioOptions = {},
) =>
    defineActor(`crawlee-e2e-${label}`, {
        source: ActorSource.dirs(
            join(import.meta.dirname, 'templates', 'base'),
            join(import.meta.dirname, 'templates', image),
        )
            .with(inlineMain(filename, main))
            .pin(inject('packs')),
        ...options,
        syncDelayMs: 0,
    });

/**
 * For scenarios that don't depend on the platform: runs them there and off it, with the SDK's local storage.
 * `APIFY_LOCAL_RUNS_ON` decides where the local run executes.
 */
export const eachRuntime = (fn: (runtime: 'platform' | 'local') => void): void =>
    describe.each(['platform', 'local'] as const)('on %s', fn);

/** The crawler's persisted statistics; throws if the crawler never wrote them. */
export const getStats = async (result: RunOutcome) => {
    const stats = (await result.getStatistics()) as StatisticPersistedState | undefined;
    if (!stats) throw new Error('crawler statistics record is missing');
    return stats;
};

/** Keys in the run's default store other than Crawlee's own state records. */
export const listUserKeys = async (result: RunTestResult) =>
    (await result.getKeyValueStoreClient().listKeys()).items
        .map(({ key }) => key)
        .filter(
            (key) => !key.startsWith('CRAWLEE_CRAWLER_STATISTICS') && !key.startsWith('CRAWLEE_SESSION_POOL_STATE'),
        );

const checkDatasetItem = (item: Record<string, unknown>, propName: string) => {
    if (!Object.hasOwn(item, propName)) return false;
    const value = item[propName];
    switch (propName) {
        case 'url':
            return typeof value === 'string' && value.match(URL_NO_COMMAS_REGEX) !== null;
        case 'modifiedDate':
            return !Number.isNaN(Date.parse(value as string));
        case 'runCount':
            return Number.isInteger(value);
        default:
            return ['string', 'number', 'boolean'].includes(typeof value);
    }
};

export const validateDataset = (items: unknown[], schema: string[]) =>
    items.every((item) => schema.every((propName) => checkDatasetItem(item as Record<string, unknown>, propName)));

export const hasNestedKey = (obj: unknown, keyName: string): boolean => {
    if (typeof obj !== 'object' || obj === null) return false;
    return Object.entries(obj).some(([key, value]) => key === keyName || hasNestedKey(value, keyName));
};
