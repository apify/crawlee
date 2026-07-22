import { setTimeout } from 'node:timers/promises';

/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 */
export const URL_NO_COMMAS_REGEX =
    /https?:\/\/(www\.)?([\p{L}0-9]|[\p{L}0-9][-\p{L}0-9@:%._+~#=]{0,254}[\p{L}0-9])\.[a-z]{2,63}(:\d{1,5})?(\/[-\p{L}0-9@:%_+.~#?&/=()'*]*)?/giu;

/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 */
export const URL_WITH_COMMAS_REGEX =
    /https?:\/\/(www\.)?([\p{L}0-9]|[\p{L}0-9][-\p{L}0-9@:%._+~#=]{0,254}[\p{L}0-9])\.[a-z]{2,63}(:\d{1,5})?(\/[-\p{L}0-9@:%_+,.~#?&/=()'*]*)?/giu;

/**
 * Computes a weighted average of an array of numbers, complemented by an array of weights.
 * @ignore
 */
export function weightedAvg(arrValues: number[], arrWeights: number[]): number {
    const result = arrValues
        .map((value, i) => {
            const weight = arrWeights[i];
            const sum = value * weight;

            return [sum, weight];
        })
        .reduce((p, c) => [p[0] + c[0], p[1] + c[1]], [0, 0]);

    return result[0] / result[1];
}

/**
 * Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting
 * in your code, e.g. to prevent overloading of target website or to avoid bot detection.
 *
 * **Example usage:**
 *
 * ```
 * import { sleep } from 'crawlee';
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await sleep(1500);
 * ```
 * @param millis Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.
 */
export async function sleep(millis?: number): Promise<void> {
    return setTimeout(millis ?? undefined);
}

/**
 * Converts SNAKE_CASE to camelCase.
 * @ignore
 */
export function snakeCaseToCamelCase(snakeCaseStr: string): string {
    return snakeCaseStr
        .toLowerCase()
        .split('_')
        .map((part, index) => {
            return index > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part;
        })
        .join('');
}

/**
 * Traverses DOM and expands shadow-root elements (created by custom components).
 * @ignore
 */
export function expandShadowRoots(document: Document): string {
    // Returns HTML of given shadow DOM.
    function getShadowDomHtml(shadowRoot: any) {
        let shadowHTML = '';

        for (const el of shadowRoot.childNodes) {
            shadowHTML += el.nodeValue ?? el.outerHTML ?? '';
        }

        return shadowHTML;
    }

    // Recursively replaces shadow DOMs with their HTML.
    function replaceShadowDomsWithHtml(rootElement: any) {
        for (const el of rootElement.querySelectorAll('*')) {
            if (el.shadowRoot) {
                replaceShadowDomsWithHtml(el.shadowRoot);
                let content = el.getHTML?.({ serializableShadowRoots: true }).trim();

                if (!(content?.length > 0)) {
                    content = getShadowDomHtml(el.shadowRoot) ?? '';
                }
                el.innerHTML += content;
            }
        }
    }

    replaceShadowDomsWithHtml(document.body);

    return document.documentElement.outerHTML;
}

/**
 * Checks if the given value is a Node.js Stream or a Web API ReadableStream.
 * @ignore
 */
export function isStream(value: unknown): value is NodeJS.ReadableStream | ReadableStream {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    // A Node.js Readable is both pipeable and async-iterable; a Web ReadableStream exposes pipeTo.
    // Requiring async-iterability for the `pipe` branch rejects plain `{ pipe }` ducks that would
    // otherwise blow up later in the storage backends' drain loop with a cryptic TypeError.
    const isNodeStream =
        typeof (value as any).pipe === 'function' && typeof (value as any)[Symbol.asyncIterator] === 'function';
    const isWebStream = typeof (value as any).pipeTo === 'function';

    return isNodeStream || isWebStream;
}

/**
 * Checks if the given value is a Node.js Buffer, ArrayBuffer, or TypedArray.
 * @ignore
 */
export function isBuffer(value: unknown): value is Buffer | ArrayBuffer | ArrayBufferView {
    return (
        value != null &&
        typeof value === 'object' &&
        (Buffer.isBuffer(value) ||
            value instanceof ArrayBuffer ||
            ArrayBuffer.isView(value) ||
            (value as any).constructor?.name === 'Buffer')
    );
}

/**
 * Converts a byte-like value (Buffer, ArrayBuffer, or any typed-array / DataView) into a Buffer over
 * the exact same bytes, honoring `byteOffset` / `byteLength` for views. Existing Buffers are returned
 * as-is. Used by storage backends, which persist raw bytes regardless of the input's concrete shape.
 * @ignore
 */
export function toBuffer(value: Buffer | ArrayBuffer | ArrayBufferView): Buffer {
    if (Buffer.isBuffer(value)) {
        return value;
    }

    if (value instanceof ArrayBuffer) {
        return Buffer.from(value);
    }

    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}
