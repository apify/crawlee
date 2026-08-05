import { sleep } from '@crawlee/utils';

describe('sleep()', () => {
    test('works', async () => {
        await Promise.resolve();
        await sleep(0);
        await sleep();
        // @ts-expect-error invalid input type
        await sleep(null);
        await sleep(-1);

        const timeBefore = Date.now();
        await sleep(100);
        const timeAfter = Date.now();

        expect(timeAfter - timeBefore).toBeGreaterThanOrEqual(95);
    });
});
