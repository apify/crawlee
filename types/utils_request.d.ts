export const FIREFOX_MOBILE_USER_AGENT: "Mozilla/5.0 (Android; Mobile; rv:14.0) Gecko/14.0 Firefox/14.0";
export const FIREFOX_DESKTOP_USER_AGENT: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:68.0) Gecko/20100101 Firefox/68.0";
export namespace REQUEST_AS_BROWSER_DEFAULT_OPTIONS {
    export const countryCode: string;
    export const languageCode: string;
    export const headers: {};
    export const method: string;
    export const useMobileVersion: boolean;
    export const useBrotli: boolean;
    export const json: boolean;
    export function abortFunction(res: any): boolean;
    export const useCaseSensitiveHeaders: boolean;
    export const useStream: boolean;
    export const proxyUrl: any;
    export const timeoutSecs: number;
}
export function requestAsBrowser(options: any): Promise<any>;
