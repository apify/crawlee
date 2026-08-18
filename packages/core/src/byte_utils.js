/**
 * Checks if the given value is a Node.js Stream or a Web API ReadableStream.
 * @ignore
 */
export function isStream(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    // A Node.js Readable is both pipeable and async-iterable; a Web ReadableStream exposes pipeTo.
    // Requiring async-iterability for the `pipe` branch rejects plain `{ pipe }` ducks that would
    // otherwise blow up later in the storage backends' drain loop with a cryptic TypeError.
    const isNodeStream = typeof value.pipe === 'function' && typeof value[Symbol.asyncIterator] === 'function';
    const isWebStream = typeof value.pipeTo === 'function';
    return isNodeStream || isWebStream;
}
/**
 * Checks if the given value is a Node.js Buffer, ArrayBuffer, or TypedArray.
 * @ignore
 */
export function isBuffer(value) {
    return (value != null &&
        typeof value === 'object' &&
        (Buffer.isBuffer(value) ||
            value instanceof ArrayBuffer ||
            ArrayBuffer.isView(value) ||
            value.constructor?.name === 'Buffer'));
}
/**
 * Converts a byte-like value (Buffer, ArrayBuffer, or any typed-array / DataView) into a Buffer over
 * the exact same bytes, honoring `byteOffset` / `byteLength` for views. Existing Buffers are returned
 * as-is. Used by storage backends, which persist raw bytes regardless of the input's concrete shape.
 * @ignore
 */
export function toBuffer(value) {
    if (Buffer.isBuffer(value)) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return Buffer.from(value);
    }
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
