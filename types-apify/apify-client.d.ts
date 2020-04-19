declare module 'apify-client' {
    class ApifyClient {
        constructor(opts: any);
    }
    export = ApifyClient;
}
declare module 'apify-client/build/utils' {
    export function checkParamOrThrow(...args: any): any;
    export function parseBody(body: any, mime: any): any;
}
