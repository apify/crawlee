import { promises as fs } from 'fs';
import path from 'path';
import util from 'util';
import zlib from 'zlib';
import { serializeArray, deserializeArray, createDeserialize } from '../build/serialization';

const TEST_JSON_PATH = path.join(__dirname, 'data', 'sample.json.gz');

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
