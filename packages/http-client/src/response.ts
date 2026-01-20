export interface IResponseWithUrl extends Response {
    url: string;
}

// See https://github.com/nodejs/undici/blob/d7707ee8fd5da2d0cc64b5fae421b965faf803c8/lib/web/fetch/constants.js#L6
const nullBodyStatus = [101, 204, 205, 304];

/**
 * A Response class that includes the original request URL.
 *
 * This class extends `Response` from `fetch` API and is fully compatible with this.
 */
export class ResponseWithUrl extends Response implements IResponseWithUrl {
    override url: string;
    constructor(body: BodyInit | null, init: ResponseInit & { url?: string }) {
        const bodyParsed = nullBodyStatus.includes(init.status ?? 200) ? null : body;

        super(bodyParsed, init);
        this.url = init.url ?? '';
    }
}
