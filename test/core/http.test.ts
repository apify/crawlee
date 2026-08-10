import { parseRetryAfterHeader } from '@crawlee/core';

test('parseRetryAfterHeader parses delay-seconds and HTTP-dates', () => {
    expect(parseRetryAfterHeader('120')).toBe(120_000);
    expect(parseRetryAfterHeader('  5  ')).toBe(5000);
    // Zero-padded values are valid `delay-seconds`.
    expect(parseRetryAfterHeader('05')).toBe(5000);

    // A zero delay names no deadline; reporting it as one would leave the domain unthrottled and busy-loop.
    expect(parseRetryAfterHeader('0')).toBeNull();
    expect(parseRetryAfterHeader('00')).toBeNull();

    // date format
    const futureDate = new Date(Date.now() + 5000).toUTCString();
    const delay = parseRetryAfterHeader(futureDate);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(5500);

    // A date in the past means "no delay", not a negative one.
    expect(parseRetryAfterHeader(new Date(Date.now() - 5000).toUTCString())).toBeNull();

    expect(parseRetryAfterHeader(null)).toBeNull();
    expect(parseRetryAfterHeader(undefined)).toBeNull();
    expect(parseRetryAfterHeader('')).toBeNull();
    expect(parseRetryAfterHeader('invalid')).toBeNull();
    // Not `delay-seconds`; a negative delay would have suppressed the backoff entirely.
    expect(parseRetryAfterHeader('-5')).toBeNull();
    expect(parseRetryAfterHeader('1.5')).toBeNull();
});
