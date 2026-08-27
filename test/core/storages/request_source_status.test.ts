import type { RequestSourceStatus } from '@crawlee/core';
import { describe, expect, test } from 'vitest';

// Not part of the public surface, so it is reached the way the other internal helpers are tested.
import { joinRequestSourceStatuses } from '../../../packages/core/src/storages/request_loader.js';

describe('joinRequestSourceStatuses', () => {
    const ready = { status: 'ready' } as const satisfies RequestSourceStatus;
    const stalled = {
        status: 'stalled',
        reason: 'example.com is stonewalling us',
    } as const satisfies RequestSourceStatus;
    const waiting = { status: 'waiting' } as const satisfies RequestSourceStatus;
    const finished = { status: 'finished' } as const satisfies RequestSourceStatus;

    // Both directions of every pair, because the join has to be commutative for two sources read as one.
    test.each([
        [ready, ready, ready],
        [ready, stalled, ready],
        [ready, waiting, ready],
        [ready, finished, ready],
        [stalled, stalled, stalled],
        [stalled, waiting, stalled],
        [stalled, finished, stalled],
        [waiting, waiting, waiting],
        [waiting, finished, waiting],
        [finished, finished, finished],
    ] satisfies [RequestSourceStatus, RequestSourceStatus, RequestSourceStatus][])(
        '$0.status + $1.status -> $2.status',
        (a, b, expected) => {
            expect(joinRequestSourceStatuses(a, b)).toEqual(expected);
            expect(joinRequestSourceStatuses(b, a)).toEqual(expected);
        },
    );

    test('a stalled source is masked while the other one still has work', () => {
        // The crawler turns `stalled` into a `PersistentRateLimitError`, so this precedence is what keeps a
        // crawl that is making progress elsewhere from being abandoned over one hopeless domain.
        expect(joinRequestSourceStatuses(stalled, ready)).toEqual(ready);
    });

    test('the earlier of two known wake-up times wins', () => {
        expect(
            joinRequestSourceStatuses({ status: 'waiting', readyAt: 200 }, { status: 'waiting', readyAt: 100 }),
        ).toEqual({ status: 'waiting', readyAt: 100 });
        expect(
            joinRequestSourceStatuses({ status: 'waiting', readyAt: 100 }, { status: 'waiting', readyAt: 200 }),
        ).toEqual({ status: 'waiting', readyAt: 100 });
    });

    test('a known wake-up time survives a source that has none', () => {
        expect(joinRequestSourceStatuses(waiting, { status: 'waiting', readyAt: 100 })).toEqual({
            status: 'waiting',
            readyAt: 100,
        });
        expect(joinRequestSourceStatuses({ status: 'waiting', readyAt: 100 }, finished)).toEqual({
            status: 'waiting',
            readyAt: 100,
        });
    });

    test('no wake-up time is invented when neither source knows one', () => {
        expect(joinRequestSourceStatuses(waiting, waiting)).toEqual({ status: 'waiting' });
    });
});
