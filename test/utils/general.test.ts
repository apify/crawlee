import { sleep, snakeCaseToCamelCase } from '@crawlee/utils';

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

describe('snakeCaseToCamelCase()', () => {
    test('should camel case all sneaky cases of snake case', () => {
        const tests = {
            'aaa_bbb_': 'aaaBbb',
            '': '',
            'AaA_bBb_cCc': 'aaaBbbCcc',
            'a_1_b_1a': 'a1B1a',
        };

        Object.entries(tests).forEach(([snakeCase, camelCase]) => {
            expect(snakeCaseToCamelCase(snakeCase)).toEqual(camelCase);
        });
    });
});
