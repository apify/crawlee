import fs from 'node:fs';
import path from 'node:path';

import {
    downloadListOfUrls,
    extractUrls,
    URL_WITH_COMMAS_REGEX,
} from '@crawlee/utils';

vitest.mock('@crawlee/utils/src/internals/gotScraping', async () => {
    return {
        gotScraping: vitest.fn(),
    };
});

const { gotScraping } = await import('@crawlee/utils/src/internals/gotScraping');

const baseDataPath = path.join(__dirname, '..', 'shared', 'data');

const gotScrapingSpy = vitest.mocked(gotScraping);

describe('downloadListOfUrls()', () => {
    test('downloads a list of URLs', async () => {
        const text = fs.readFileSync(path.join(baseDataPath, 'simple_url_list.txt'), 'utf8');
        const arr = text.trim().split(/[\r\n]+/g).map((u) => u.trim());

        gotScrapingSpy.mockResolvedValueOnce({ body: text });

        await expect(downloadListOfUrls({
            url: 'http://www.nowhere12345.com',
        })).resolves.toEqual(arr);
    });
});

describe('extractUrls()', () => {
    const SIMPLE_URL_LIST = 'simple_url_list.txt';
    const UNICODE_URL_LIST = 'unicode_url_list.txt';
    const COMMA_URL_LIST = 'unicode+comma_url_list.txt';
    const TRICKY_URL_LIST = 'tricky_url_list.txt';
    const INVALID_URL_LIST = 'invalid_url_list.txt';

    const getURLData = (filename: string) => {
        const string = fs.readFileSync(path.join(baseDataPath, filename), 'utf8');
        const array = string.trim().split(/[\r\n]+/g).map((u) => u.trim());
        return { string, array };
    };

    const makeJSON = ({ string, array }: { string: string; array: string[] }) => JSON.stringify({
        one: [{ http: string }],
        two: array.map((url) => ({ num: 123, url })),
    });

    const makeCSV = (array: string[], delimiter?: string) => array.map((url) => ['ABC', 233, url, '.'].join(delimiter || ',')).join('\n');

    const makeText = (array: string[]) => {
        const text = fs.readFileSync(path.join(baseDataPath, 'lipsum.txt'), 'utf8').split('');
        const ID = 'ů';
        const maxIndex = text.length - 1;
        array.forEach((__, index) => {
            const indexInText = (index * 17) % maxIndex;
            if (text[indexInText] === ID) {
                text[indexInText + 1] = ID;
            } else {
                text[indexInText] = ID;
            }
        });
        return array.reduce((string, url) => string.replace(ID, ` ${url} `), text.join(''));
    };

    test('extracts simple URLs', () => {
        const { string, array } = getURLData(SIMPLE_URL_LIST);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('extracts unicode URLs', () => {
        const { string, array } = getURLData(UNICODE_URL_LIST);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('extracts unicode URLs with commas', () => {
        const { string, array } = getURLData(COMMA_URL_LIST);
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).toEqual(array);
    });

    test('extracts tricky URLs', () => {
        const { string, array } = getURLData(TRICKY_URL_LIST);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('does not extract invalid URLs', () => {
        const { string } = getURLData(INVALID_URL_LIST);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(['http://www.foo.bar']);
    });

    test('extracts simple URLs from JSON', () => {
        const d = getURLData(SIMPLE_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(d.array.concat(d.array));
    });

    test('extracts unicode URLs from JSON', () => {
        const d = getURLData(UNICODE_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(d.array.concat(d.array));
    });

    test('extracts unicode URLs with commas from JSON', () => {
        const d = getURLData(COMMA_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).toEqual(d.array.concat(d.array));
    });

    test('extracts tricky URLs from JSON', () => {
        const d = getURLData(TRICKY_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(d.array.concat(d.array));
    });

    test('does not extract invalid URLs from JSON', () => {
        const d = getURLData(INVALID_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(['http://www.foo.bar', 'http://www.foo.bar']);
    });

    test('extracts simple URLs from CSV', () => {
        const { array } = getURLData(SIMPLE_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('extracts unicode URLs from CSV', () => {
        const { array } = getURLData(UNICODE_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('extracts unicode URLs with commas from semicolon CSV', () => {
        const { array } = getURLData(COMMA_URL_LIST);
        const string = makeCSV(array, ';');
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).toEqual(array);
    });

    test('extracts tricky URLs from CSV', () => {
        const { array } = getURLData(TRICKY_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('does not extract invalid URLs from CSV', () => {
        const { array } = getURLData(INVALID_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(['http://www.foo.bar']);
    });

    test('extracts simple URLs from Text', () => {
        const { array } = getURLData(SIMPLE_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('extracts unicode URLs from Text', () => {
        const { array } = getURLData(UNICODE_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('extracts unicode URLs with commas from Text', () => {
        const { array } = getURLData(COMMA_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).toEqual(array);
    });

    test('extracts tricky URLs from Text', () => {
        const { array } = getURLData(TRICKY_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(array);
    });

    test('does not extract invalid URLs from Text', () => {
        const { array } = getURLData(INVALID_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).toEqual(['http://www.foo.bar']);
    });
});
