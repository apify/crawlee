import { checkParamOrThrow } from 'apify-client/build/utils';
import stream, { Readable } from 'stream';
import StreamArray from 'stream-json/streamers/StreamArray';
import util from 'util';
import zlib from 'zlib';

const pipeline = util.promisify(stream.pipeline);

/**
 * Simple stream that transforms a stream of values
 * into a valid JSON by adding brackets and commas.
 */
class ToJsonStream extends stream.Transform {
    constructor() {
        super({ autoDestroy: true, writableObjectMode: true });
        this.push('[');
        this.isFirstItem = true;
    }

    _transform(item, nil, callback) {
        let json;
        try {
            json = JSON.stringify(item);
        } catch (err) {
            callback(err);
        }
        if (this.isFirstItem) {
            const chunk = Buffer.from(json, 'utf8');
            callback(null, chunk);
            this.isFirstItem = false;
        } else {
            const chunk = Buffer.from(`,${json}`, 'utf8');
            callback(null, chunk);
        }
    }

    _flush(callback) {
        callback(null, ']');
    }
}

/**
 * Uses Brotli compression to take an array of values, which can be anything
 * from entries in a Dataset to Requests in a RequestList and compresses
 * them to a Buffer in a memory-efficient way (streaming one by one). Ideally,
 * the largest chunk of memory consumed will be the final compressed Buffer.
 * This could be further improved by outputting a Stream, if and when
 * apify-client supports streams.
 *
 * @param {Array} data
 * @returns {Promise<Buffer>}
 * @ignore
 */
exports.compressData = async (data) => {
    checkParamOrThrow(data, 'data', 'Array');
    const { chunks, collector } = createChunkCollector();
    await pipeline(
        stream.Readable.from(data),
        new ToJsonStream(),
        zlib.createBrotliCompress(),
        collector,
    );
    return Buffer.concat(chunks);
};

/**
 * Decompresses a Buffer previously created with compressData (technically,
 * any JSON that is an Array) and collects it into an Array of values
 * in a memory-efficient way (streaming the array items one by one instead
 * of creating a fully decompressed buffer -> full JSON -> full Array all
 * in memory at once. Could be further optimized to ingest a Stream if and
 * when apify-client supports streams.
 *
 * @param {Buffer} compressedData
 * @returns {Promise<Array>}
 * @ignore
 */
exports.decompressData = async (compressedData) => {
    checkParamOrThrow(compressedData, 'compressedData', 'Buffer');
    const { chunks, collector } = createChunkCollector({ fromValuesStream: true });
    await pipeline(
        stream.Readable.from([compressedData]),
        zlib.createBrotliDecompress(),
        StreamArray.withParser(),
        collector,
    );
    return chunks;
};

/**
 * Creates a stream that decompresses a Buffer previously created with
 * compressData (technically, any JSON that is an Array) and collects it
 * into an Array of values in a memory-efficient way (streaming the array
 * items one by one instead of creating a fully decompressed buffer
 * -> full JSON -> full Array all in memory at once. Could be further
 * optimized to ingest a Stream if and when apify-client supports streams.
 * @param compressedData
 * @returns {Readable}
 */
exports.createDecompress = (compressedData) => {
    checkParamOrThrow(compressedData, 'compressedData', 'Buffer');
    const streamArray = StreamArray.withParser();
    const destination = pluckValue(streamArray);
    stream.pipeline(
        stream.Readable.from([compressedData]),
        zlib.createBrotliDecompress(),
        destination,
        err => destination.emit(err),
    );
    return destination;
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

function pluckValue(streamArray) {
    const realPush = streamArray.push.bind(streamArray);
    streamArray.push = obj => realPush(obj && obj.value);
    return streamArray;
}
