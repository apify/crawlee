import { checkParamOrThrow } from 'apify-client/build/utils';
import stream from 'stream';
import { disassembler } from 'stream-json/Disassembler';
import { stringer } from 'stream-json/Stringer';
import StreamValues from 'stream-json/streamers/StreamValues';
import util from 'util';
import zlib from 'zlib';

const pipeline = util.promisify(stream.pipeline);
//
// class ToJsonStream extends stream.Transform {
//     constructor() {
//         super({ autoDestroy: true, readableObjectMode: true });
//         this.push('[');
//         this.isFirstItem = true;
//     }
//
//     _transform(item, nil, callback) {
//         let json;
//         try {
//             json = JSON.stringify(item);
//         } catch (err) {
//             callback(err);
//         }
//         if (this.isFirstItem) {
//             const chunk = Buffer.from(json, 'utf8');
//             callback(null, chunk);
//             this.isFirstItem = false;
//         } else {
//             const chunk = Buffer.from(`,${json}`, 'utf8');
//             callback(null, chunk);
//         }
//     }
//
//     _flush(callback) {
//         callback(null, ']');
//     }
// }

exports.compressData = async (arrayOfObjects) => {
    checkParamOrThrow(arrayOfObjects, 'arrayOfObjects', '[Object]');
    const { chunks, collector } = createChunkCollector();
    await pipeline(
        stream.Readable.from(arrayOfObjects),
        disassembler(),
        stringer(),
        zlib.createBrotliCompress(),
        collector,
    );
    return Buffer.concat(chunks);
};

exports.decompressData = async (compressedData) => {
    checkParamOrThrow(compressedData, 'compressedData', 'Buffer');
    const { chunks, collector } = createChunkCollector({ fromValuesStream: true });
    await pipeline(
        stream.Readable.from([compressedData]),
        zlib.createBrotliDecompress(),
        StreamValues.withParser(),
        collector,
    );
    return chunks;
};

/**
 * @return {{chunks: Array<string|Buffer>, collector: module:stream.internal.Writable}}
 */
function createChunkCollector(options = {}) {
    const { fromValuesStream = false } = options;
    const chunks = [];
    const collector = new stream.Writable({ // eslint-disable-line no-shadow
        decodeStrings: false,
        objectMode: fromValuesStream,
        write(chunk, nil, callback) {
            chunks.push(fromValuesStream ? chunk.value : chunk);
            callback();
        },
        writev(chunkObjects, callback) {
            const buffers = chunkObjects.map(({ chunk }) => {
                return fromValuesStream ? chunk.value : chunk;
            });
            chunkObjects.push(...buffers);
            callback();
        },
    });
    return { collector, chunks };
}
