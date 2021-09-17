import ow from 'ow';
import stream from 'stream'; // eslint-disable-line import/no-duplicates
import StreamArray from 'stream-json/streamers/StreamArray';
import util from 'util';
import zlib from 'zlib';

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { Readable } from 'stream';
// eslint-enable-line import/no-duplicates

const pipeline = util.promisify(stream.pipeline);

/**
 * Transforms an array of items to a JSON in a streaming
 * fashion to save memory. It operates in batches to speed
 * up the process.
 * @ignore
 * @internal
 */
class ArrayToJson extends stream.Readable {
    constructor(data, options = {}) {
        super({
            ...options,
            autoDestroy: true,
            emitClose: true,
        });
        const { batchSize = 10000 } = options;
        this.offset = 0;
        this.batchSize = batchSize;
        this.data = data;
        this.push('[');
    }

    _read() {
        try {
            const items = this.data.slice(this.offset, this.offset + this.batchSize);
            if (items.length) {
                const json = JSON.stringify(items);
                // Strip brackets to flatten the batch.
                const itemString = json.substring(1, json.length - 1);
                if (this.offset > 0) this.push(',', 'utf8');
                this.push(itemString, 'utf8');
                this.offset += this.batchSize;
            } else {
                this.push(']');
                this.push(null);
            }
        } catch (err) {
            this.emit('error', err);
        }
    }
}

/**
 * Uses Gzip compression to take an array of values, which can be anything
 * from entries in a Dataset to Requests in a RequestList and compresses
 * them to a Buffer in a memory-efficient way (streaming one by one). Ideally,
 * the largest chunk of memory consumed will be the final compressed Buffer.
 * This could be further improved by outputting a Stream, if and when
 * apify-client supports streams.
 *
 * @param {Array<*>} data
 * @returns {Promise<Buffer>}
 * @ignore
 */
export const serializeArray = async (data) => {
    ow(data, ow.array);
    const { chunks, collector } = createChunkCollector();
    await pipeline(
        new ArrayToJson(data),
        zlib.createGzip(),
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
 * @returns {Promise<Array<*>>}
 * @ignore
 */
export const deserializeArray = async (compressedData) => {
    ow(compressedData, ow.buffer);
    const { chunks, collector } = createChunkCollector({ fromValuesStream: true });
    await pipeline(
        stream.Readable.from([compressedData]),
        zlib.createGunzip(),
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
 * @ignore
 */
export const createDeserialize = (compressedData) => {
    ow(compressedData, ow.buffer);
    const streamArray = StreamArray.withParser();
    const destination = pluckValue(streamArray);
    stream.pipeline(
        stream.Readable.from([compressedData]),
        zlib.createGunzip(),
        destination,
        (err) => destination.emit(err),
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
    streamArray.push = (obj) => realPush(obj && obj.value);
    return streamArray;
}
