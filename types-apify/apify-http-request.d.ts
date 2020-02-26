declare module '@apify/http-request' {
    const EXPORTED: (...args: any) => any;
    export = EXPORTED;
}

declare module '@apify/http-request/src/errors' {
    export const TimeoutError: Error;
}
