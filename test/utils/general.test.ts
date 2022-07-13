import { isDocker, weightedAvg, sleep, snakeCaseToCamelCase, parseContentTypeFromResponse } from '@crawlee/utils';
import type { IncomingMessage } from 'node:http';
import asyncFs from 'node:fs/promises';

describe('isDocker()', () => {
    test('works for dockerenv && cgroup', async () => {
        const statMock = jest.spyOn(asyncFs, 'stat').mockImplementationOnce(() => Promise.resolve(null));
        const readMock = jest.spyOn(asyncFs, 'readFile').mockImplementationOnce(() => Promise.resolve('something ... docker ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
        statMock.mockRestore();
        readMock.mockRestore();
    });

    test('works for dockerenv', async () => {
        const statMock = jest.spyOn(asyncFs, 'stat').mockImplementationOnce(() => Promise.resolve(null));
        const readMock = jest.spyOn(asyncFs, 'readFile').mockImplementationOnce(() => Promise.resolve('something ... ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
        statMock.mockRestore();
        readMock.mockRestore();
    });

    test('works for cgroup', async () => {
        const statMock = jest.spyOn(asyncFs, 'stat').mockImplementationOnce(() => Promise.reject(new Error('no.')));
        const readMock = jest.spyOn(asyncFs, 'readFile').mockImplementationOnce(() => Promise.resolve('something ... docker ... something'));

        const is = await isDocker(true);

        expect(is).toBe(true);
        statMock.mockRestore();
        readMock.mockRestore();
    });

    test('works for nothing', async () => {
        const statMock = jest.spyOn(asyncFs, 'stat').mockImplementationOnce(() => Promise.reject(new Error('no.')));
        const readMock = jest.spyOn(asyncFs, 'readFile').mockImplementationOnce(() => Promise.resolve('something ... ... something'));

        const is = await isDocker(true);

        expect(is).toBe(false);
        statMock.mockRestore();
        readMock.mockRestore();
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
            aaa_bbb_: 'aaaBbb',
            '': '',
            AaA_bBb_cCc: 'aaaBbbCcc',
            a_1_b_1a: 'a1B1a',
        };

        Object.entries(tests).forEach(([snakeCase, camelCase]) => {
            expect(snakeCaseToCamelCase(snakeCase)).toEqual(camelCase);
        });
    });
});

describe('parseContentTypeFromResponse', () => {
    test('should parse content type from header', () => {
        const parsed = parseContentTypeFromResponse({ url: 'http://example.com', headers: { 'content-type': 'text/html; charset=utf-8' } } as IncomingMessage);
        expect(parsed.type).toBe('text/html');
        expect(parsed.charset).toBe('utf-8');
    });

    test('should parse content type from file extension', () => {
        const parsedHtml = parseContentTypeFromResponse({ url: 'http://www.example.com/foo/file.html?someparam=foo', headers: {} } as IncomingMessage);
        expect(parsedHtml.type).toBe('text/html');
        expect(parsedHtml.charset).toBe('utf-8');

        const parsedTxt = parseContentTypeFromResponse({ url: 'http://www.example.com/foo/file.txt', headers: {} } as IncomingMessage);
        expect(parsedTxt.type).toBe('text/plain');
        expect(parsedTxt.charset).toBe('utf-8');
    });

    test('should return default content type for bad content type headers', () => {
        const parsedWithoutCt = parseContentTypeFromResponse({ url: 'http://www.example.com/foo/file', headers: {} } as IncomingMessage);
        expect(parsedWithoutCt.type).toBe('application/octet-stream');
        expect(parsedWithoutCt.charset).toBe('utf-8');

        const parsedBadHeader = parseContentTypeFromResponse({
            url: 'http://www.example.com/foo/file.html',
            headers: { 'content-type': 'text/html,text/html' },
        } as IncomingMessage);
        expect(parsedBadHeader.type).toBe('text/html');
        expect(parsedBadHeader.charset).toBe('utf-8');

        const parsedReallyBad = parseContentTypeFromResponse({ url: 'http://www.example.com/foo', headers: { 'content-type': 'crazy-stuff' } } as IncomingMessage);
        expect(parsedReallyBad.type).toBe('application/octet-stream');
        expect(parsedReallyBad.charset).toBe('utf-8');
    });
});
