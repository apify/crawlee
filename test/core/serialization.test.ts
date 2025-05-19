import { promises as fs } from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import zlib from 'node:zlib';

import { createDeserialize, deserializeArray, serializeArray } from '@crawlee/core';

const TEST_JSON_PATH = path.join(import.meta.dirname, '..', 'shared', 'data', 'sample.json.gz');

const gunzip = util.promisify(zlib.gunzip);

describe('Data Compression:', () => {
    test('serializeArray should compress', async () => {
        const compressedTestJson = await fs.readFile(TEST_JSON_PATH);
        const jsonBuffer = await gunzip(compressedTestJson);
        const expectedArray = JSON.parse(jsonBuffer.toString('utf8'));

        const compressed = await serializeArray(expectedArray);
        const decompressed = await gunzip(compressed);
        const decompressedJson = decompressed.toString('utf8');
        const receivedArray = JSON.parse(decompressedJson);

        // Compare objects, to avoid errors with /n /t and other insignificant
        // characters in the JSON strings.
        expect(receivedArray).toEqual(expectedArray);
    });

    test('deserializeArray should decompress', async () => {
        const compressedTestJson = await fs.readFile(TEST_JSON_PATH);
        const jsonBuffer = await gunzip(compressedTestJson);
        const expectedArray = JSON.parse(jsonBuffer.toString('utf8'));

        const receivedArray = await deserializeArray(compressedTestJson);

        // Compare objects, to avoid errors with /n /t and other insignificant
        // characters in the JSON strings.
        expect(receivedArray).toEqual(expectedArray);
    });

    test('serializeArray + deserializeArray should produce original data', async () => {
        const data = [];
        for (let i = 0; i < 10000; i++) {
            data.push({ [`${Math.random()}`]: Math.random() });
        }
        const compressed = await serializeArray(data);
        const decompressed = await deserializeArray(compressed);
        expect(decompressed).toEqual(data);
    });

    test('createDeserialize should work', async () => {
        const compressedTestJson = await fs.readFile(TEST_JSON_PATH);
        const jsonBuffer = await gunzip(compressedTestJson);
        const expectedArray = JSON.parse(jsonBuffer.toString('utf8'));

        const decompress = createDeserialize(compressedTestJson);
        const receivedArray = [];
        for await (const item of decompress) {
            receivedArray.push(item);
        }
        expect(receivedArray).toEqual(expectedArray);
    });
});
