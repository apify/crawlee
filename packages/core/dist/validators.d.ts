import type { Dictionary } from '@crawlee/types';
/** @internal */
export declare const validators: {
    browserPage: (value: Dictionary) => {
        validator: boolean;
        message: (label: string) => string;
    };
    proxyConfiguration: (value: Dictionary) => {
        validator: boolean;
        message: (label: string) => string;
    };
    requestList: (value: Dictionary) => {
        validator: boolean;
        message: (label: string) => string;
    };
    requestQueue: (value: Dictionary) => {
        validator: boolean;
        message: (label: string) => string;
    };
};
//# sourceMappingURL=validators.d.ts.map