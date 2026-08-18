import type { Server } from 'node:http';
import type { Application } from 'express';
export declare const startExpressAppPromise: (app: Application, port: number) => Promise<Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>>;
export declare const responseSamples: {
    json: {
        foo: string;
    };
    xml: string;
    complexXml: string;
    image: NonSharedBuffer;
    html: string;
    resources: string;
    cacheable: {
        html: string;
        css: string;
        js: string;
    };
    htmlWithOutsideRedirect: string;
    cloudflareBlocking: string;
    outsideIframe: string;
    insideIframe: string;
    shadowRoots: string;
};
export declare function runExampleComServer(): Promise<[Server, number]>;
