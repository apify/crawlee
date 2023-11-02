import asyncFs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';

import { isDocker, weightedAvg, sleep, snakeCaseToCamelCase } from '@crawlee/utils';

describe('isDocker()', () => {
    test('works for dockerenv && cgroup', async () => {
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => Promise.resolve(null));
        const readMock = vitest.spyOn(asyncFs, 'readFile').mockImplementationOnce(async () => Promise.resolve('something ... docker ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
    });

    test('works for dockerenv', async () => {
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => Promise.resolve(null));
        const readMock = vitest.spyOn(asyncFs, 'readFile').mockImplementationOnce(async () => Promise.resolve('something ... ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
    });

    test('works for cgroup', async () => {
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => Promise.reject(new Error('no.')));
        const readMock = vitest.spyOn(asyncFs, 'readFile').mockImplementationOnce(async () => Promise.resolve('something ... docker ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
    });

    test('works for nothing', async () => {
        const statMock = vitest.spyOn(asyncFs, 'stat').mockImplementationOnce(async () => Promise.reject(new Error('no.')));
        const readMock = vitest.spyOn(asyncFs, 'readFile').mockImplementationOnce(async () => Promise.resolve('something ... ... something'));

        const is = await isDocker(true);

        expect(is).toBe(false);
    });
});

describe('weightedAvg()', () => {
    test('works', () => {
        expect(weightedAvg([10, 10, 10], [1, 1, 1])).toBe(10);
        expect(weightedAvg([5, 10, 15], [1, 1, 1])).toBe(10);
        expect(weightedAvg([10, 10, 10], [0.5, 1, 1.5])).toBe(10);
        expect(weightedAvg([29, 35, 89], [13, 91, 3])).toEqual(((29 * 13) + (35 * 91) + (89 * 3)) / (13 + 91 + 3));
        expect(weightedAvg([], [])).toEqual(NaN);
        expect(weightedAvg([1], [0])).toEqual(NaN);
        expect(weightedAvg([], [1])).toEqual(NaN);
    });
});

describe('sleep()', () => {
    test('works', async () => {
        await Promise.resolve();
        await sleep(0);
        await sleep();
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
