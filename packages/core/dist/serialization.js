"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeserialize = exports.deserializeArray = exports.serializeArray = void 0;
const tslib_1 = require("tslib");
const ow_1 = tslib_1.__importDefault(require("ow"));
const stream_1 = require("stream");
const StreamArray_1 = tslib_1.__importDefault(require("stream-json/streamers/StreamArray"));
const node_util_1 = tslib_1.__importDefault(require("node:util"));
const node_zlib_1 = tslib_1.__importDefault(require("node:zlib"));
const pipeline = node_util_1.default.promisify(stream_1.pipeline);
/**
 * Transforms an array of items to a JSON in a streaming
 * fashion to save memory. It operates in batches to speed
 * up the process.
 * @internal
 */
class ArrayToJson extends stream_1.Readable {
    constructor(data, options = {}) {
        super({
            ...options,
            autoDestroy: true,
            emitClose: true,
        });
        Object.defineProperty(this, "data", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: data
        });
        Object.defineProperty(this, "offset", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "batchSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const { batchSize = 10000 } = options;
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
                if (this.offset > 0)
                    this.push(',', 'utf8');
                this.push(itemString, 'utf8');
                this.offset += this.batchSize;
            }
            else {
                this.push(']');
                this.push(null);
            }
        }
        catch (err) {
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
 * @internal
 */
async function serializeArray(data) {
    (0, ow_1.default)(data, ow_1.default.array);
    const { chunks, collector } = createChunkCollector();
    await pipeline(new ArrayToJson(data), node_zlib_1.default.createGzip(), collector);
    return Buffer.concat(chunks);
}
exports.serializeArray = serializeArray;
/**
 * Decompresses a Buffer previously created with compressData (technically,
 * any JSON that is an Array) and collects it into an Array of values
 * in a memory-efficient way (streaming the array items one by one instead
 * of creating a fully decompressed buffer -> full JSON -> full Array all
 * in memory at once. Could be further optimized to ingest a Stream if and
 * when apify-client supports streams.
 * @internal
 */
async function deserializeArray(compressedData) {
    (0, ow_1.default)(compressedData, ow_1.default.buffer);
    const { chunks, collector } = createChunkCollector({ fromValuesStream: true });
    await pipeline(stream_1.Readable.from([compressedData]), node_zlib_1.default.createGunzip(), StreamArray_1.default.withParser(), collector);
    return chunks;
}
exports.deserializeArray = deserializeArray;
/**
 * Creates a stream that decompresses a Buffer previously created with
 * compressData (technically, any JSON that is an Array) and collects it
 * into an Array of values in a memory-efficient way (streaming the array
 * items one by one instead of creating a fully decompressed buffer
 * -> full JSON -> full Array all in memory at once. Could be further
 * optimized to ingest a Stream if and when apify-client supports streams.
 * @internal
 */
function createDeserialize(compressedData) {
    (0, ow_1.default)(compressedData, ow_1.default.buffer);
    const streamArray = StreamArray_1.default.withParser();
    const destination = pluckValue(streamArray);
    (0, stream_1.pipeline)(stream_1.Readable.from([compressedData]), node_zlib_1.default.createGunzip(), destination, 
    // @ts-expect-error Something's wrong here, the types are wrong but tests fail if we correct the code to make them right
    (err) => destination.emit(err));
    return destination;
}
exports.createDeserialize = createDeserialize;
function createChunkCollector(options = {}) {
    const { fromValuesStream = false } = options;
    const chunks = [];
    const collector = new stream_1.Writable({
        decodeStrings: false,
        objectMode: fromValuesStream,
        write(chunk, _nil, callback) {
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
//# sourceMappingURL=serialization.js.map