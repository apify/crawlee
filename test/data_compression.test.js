import { promises as fs } from 'fs';
import path from 'path';
import util from 'util';
import zlib from 'zlib';
import { compressData, decompressData } from '../build/data_compression';

const SAMPLE_JSON_PATH = path.join(__dirname, 'data', 'sample.json.br');

const brotliCompress = util.promisify(zlib.brotliCompress);
const brotliDecompress = util.promisify(zlib.brotliDecompress);

describe('Data Compression:', () => {
    test('compressData should compress', async () => {
        const compressedJson = await fs.readFile(SAMPLE_JSON_PATH);
        const json = await brotliDecompress(compressedJson);
        const data = JSON.parse(json);
        const result = await compressData(data);
        expect(result).toEqual(data);
    });

    test('decompressData should decompress', async () => {

    });

    test('compressData + decompressData should produce original data', async () => {
        const data = [
            { foo: 'baz' },
            { foo: 'baz' },
            { foo: 'bar' },
            { foo: 'baz' },
            { foo: 'baz' },
            { foo: 'bar' },
            { foo: 'baz' },
            { foo: 'bar' },
            { foo: 'baz' },
            { foo: 'bar' },
            { foo: 'bar' },
            { foo: 'bar' },
            { foo: 'bar' },
        ];
        const compressed = await compressData(data);
        console.log('COMPRESSED:', compressed.toString('utf8'));
        const decomp = await decompressData(compressed);
        console.dir(decomp);
    });
});

async function compressJson() {
    return new Promise((resolve) => {
        fs.createReadStream(SAMPLE_JSON_PATH)
            .pipe(zlib.createBrotliCompress())
            .pipe(fs.createWriteStream(`${SAMPLE_JSON_PATH}.br`))
            .on('finish', resolve);
    });
}
