export { ArgumentValidationError, parseArgument } from '@crawlee/utils';
export { schemas } from '@crawlee/utils/internal';
/** @internal */
export declare const validators: {
    browserPage: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    proxyConfiguration: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    requestList: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    requestQueue: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    browserPool: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    sessionPool: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    requestManager: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    storageBackend: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    logger: import("zod").ZodType<import("@crawlee/types").Dictionary, unknown, import("zod/v4/core").$ZodTypeInternals<import("@crawlee/types").Dictionary, unknown>>;
    httpClient: import("zod").ZodCustom<import("@crawlee/http-client").BaseHttpClient, import("@crawlee/http-client").BaseHttpClient>;
};
