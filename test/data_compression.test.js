import { promises as fs } from 'fs';
import path from 'path';
import util from 'util';
import zlib from 'zlib';
import { compressData, decompressData } from '../build/data_compression';

const TEST_JSON_PATH = path.join(__dirname, 'data', 'sample.json.br');

const brotliDecompress = util.promisify(zlib.brotliDecompress);

describe('Data Compression:', () => {
    test('compressData should compress', async () => {
        const compressedTestJson = await fs.readFile(TEST_JSON_PATH);
        const jsonBuffer = await brotliDecompress(compressedTestJson);
        const expectedObject = JSON.parse(jsonBuffer.toString('utf8'));

        const compressed = await compressData(expectedObject);
        const decompressed = await brotliDecompress(compressed);
        const decompressedJson = decompressed.toString('utf8');
        const receivedObject = JSON.parse(decompressedJson);

        // Compare objects, to avoid errors with /n /t and other insignificant
        // characters in the JSON strings.
        expect(receivedObject).toEqual(expectedObject);
    });

    test('decompressData should decompress', async () => {
        const compressedTestJson = await fs.readFile(TEST_JSON_PATH);
        const jsonBuffer = await brotliDecompress(compressedTestJson);
        const expectedObject = JSON.parse(jsonBuffer.toString('utf8'));

        const receivedObject = await decompressData(compressedTestJson);

        // Compare objects, to avoid errors with /n /t and other insignificant
        // characters in the JSON strings.
        expect(receivedObject).toEqual(expectedObject);
    });

    test('compressData + decompressData should produce original data', async () => {
        const data = [];
        for (let i = 0; i < 10000; i++) {
            data.push({ [`${Math.random()}`]: Math.random() });
        }
        const compressed = await compressData(data);
        const decompressed = await decompressData(compressed);
        expect(decompressed).toEqual(data);
    });
});
