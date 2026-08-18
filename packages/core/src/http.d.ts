/**
 * Parses a `Retry-After` response header into a delay in milliseconds.
 *
 * The header holds either a non-negative number of seconds or an HTTP-date.
 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After).
 *
 * @returns The delay in milliseconds, or `null` if the header is absent, unparseable, or already elapsed.
 */
export declare function parseRetryAfterHeader(value?: string | null): number | null;
