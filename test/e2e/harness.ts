import { join } from 'node:path';

import type { StatisticPersistedState } from '@crawlee/basic';
import { URL_NO_COMMAS_REGEX } from '@crawlee/utils/internal';
import { type RunTestResult, useHarness, type VitestHarness } from 'apify-test-tools';
import { ActorSource } from 'apify-test-tools/harness';
import { inject } from 'vitest';

export const token = process.env.APIFY_TEST_USER_API_TOKEN!;

/** `test`/`createActor`/`runActor` bound to this test file; see apify-test-tools `useHarness`. */
export const harness = (): VitestHarness => useHarness({ token, namePrefix: 'crawlee-e2e' });

/**
 * The Actor whose entry point is `main`, a top-level function of the test file at `filename`, built from the image's
 * template and pinned to the packed workspace packages. `main` is read from disk and transpiled on its own, so it must
 * be self-contained: dependencies via `await import()`, no references to the rest of the test file.
 */
export const scenario = (filename: string, main: () => unknown, { image = 'node' } = {}) =>
    ActorSource.dirs(join(import.meta.dirname, 'templates', 'base'), join(import.meta.dirname, 'templates', image))
        .main(filename, main)
        .pin(inject('packs'));

/** The crawler's persisted statistics; throws if the crawler never wrote them. */
export const getStats = async (result: RunTestResult) => {
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
