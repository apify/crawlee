/**
 * The canonical form of a hostname: lower-case, punycode, and without the optional root dot.
 *
 * Pass both sides of a hostname comparison through this, so that a domain written as `háčky.cz` still matches the
 * `xn--hky-ela4t.cz` that `URL` reports.
 *
 * @internal
 */
export function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/\.$/, '');
}
