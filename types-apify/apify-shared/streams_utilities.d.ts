declare module 'apify-shared/streams_utilities' {
    export function readStreamToString(response: any, encoding: any): any;
    export function concatStreamToBuffer(response: any): any;
}
