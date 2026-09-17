/**
 * Parses a `Retry-After` response header into a delay in milliseconds.
 *
 * The header holds either a non-negative number of seconds or an HTTP-date.
 * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After).
 *
 * @returns The delay in milliseconds, or `null` if the header is absent, unparseable, or already elapsed.
 */
export function parseRetryAfterHeader(value?: string | null): number | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();

    // Per the spec this is a `delay-seconds`: digits only, so a negative or fractional value is not one.
    if (/^\d+$/.test(trimmed)) {
        // `Retry-After: 0` names no future deadline, same as an HTTP-date that has already passed. Reporting it
        // as a zero delay would leave the domain unthrottled while still counting as a rate-limit event, so the
        // caller would defer the request for free and re-send it immediately.
        const delayMs = Number(trimmed) * 1000;
        return delayMs > 0 ? delayMs : null;
    }

    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) {
        const delayMs = date - Date.now();
        return delayMs > 0 ? delayMs : null;
    }

    return null;
}
