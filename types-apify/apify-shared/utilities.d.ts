declare module 'apify-shared/utilities' {
    export function checkParamPrototypeOrThrow(...args: any): any;
    export function betterSetInterval(f: Function, timeout: number): any;
    export function betterClearInterval(intervalId: any): any;
    export function promisifyServerListen(server: any): (port: any) => Promise<any>;
    export function cryptoRandomObjectId(len: number): string;
    export function leftpad(val: number, len: number, char: number): string;
}
