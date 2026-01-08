export interface IResponseWithUrl extends Response {
    url: string;
}

/**
 * A Response class that includes the original request URL.
 *
 * This class extends `Response` from `fetch` API and is fully compatible with this.
 */
export class ResponseWithUrl extends Response implements IResponseWithUrl {
    override url: string;
    constructor(body: BodyInit | null, init: ResponseInit & { url?: string }) {
        super(body, init);
        this.url = init.url ?? '';
    }
}
