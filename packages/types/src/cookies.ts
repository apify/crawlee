// Crawlee's cookie storage is tough-cookie's. Re-exporting it here keeps `tough-cookie` out of
// every other package's public API, so bumping it only ever changes this package's surface.
export { CookieJar } from 'tough-cookie';
export type { SerializedCookieJar } from 'tough-cookie';
