/**
 * Checks if the given value is a Node.js Stream or a Web API ReadableStream.
 * @ignore
 */
export declare function isStream(value: unknown): value is NodeJS.ReadableStream | ReadableStream;
/**
 * Checks if the given value is a Node.js Buffer, ArrayBuffer, or TypedArray.
 * @ignore
 */
export declare function isBuffer(value: unknown): value is Buffer | ArrayBuffer | ArrayBufferView;
/**
 * Converts a byte-like value (Buffer, ArrayBuffer, or any typed-array / DataView) into a Buffer over
 * the exact same bytes, honoring `byteOffset` / `byteLength` for views. Existing Buffers are returned
 * as-is. Used by storage backends, which persist raw bytes regardless of the input's concrete shape.
 * @ignore
 */
export declare function toBuffer(value: Buffer | ArrayBuffer | ArrayBufferView): Buffer;
