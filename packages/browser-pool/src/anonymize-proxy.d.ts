type PromiseVoid = () => Promise<void>;
export interface AnonymizeProxySugarOptions {
    ignoreProxyCertificate?: boolean;
}
/** @internal */
export declare const anonymizeProxySugar: (proxyUrl?: string, username?: string, password?: string, options?: AnonymizeProxySugarOptions) => Promise<[string | undefined, PromiseVoid]>;
export {};
