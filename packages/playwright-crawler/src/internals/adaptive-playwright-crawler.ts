import { playwrightLocatorPortadom, type CheerioPortadom, type PlaywrightLocatorPortadom } from 'portadom';

import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from './playwright-crawler';
import { PlaywrightCrawler } from './playwright-crawler';
import type { Awaitable, Dictionary, RestrictedCrawlingContext } from '..';

interface AdaptivePlaywrightCrawlerContext extends RestrictedCrawlingContext {
    dom: CheerioPortadom | PlaywrightLocatorPortadom;
}

interface AdaptivePlaywrightCrawlerOptions extends Omit<PlaywrightCrawlerOptions, 'requestHandler'> {
    requestHandler: (crawlingContext: AdaptivePlaywrightCrawlerContext) => Awaitable<void>;
}

class RequestHandlerResult {
    pushData: RestrictedCrawlingContext['pushData'] = async (data, datasetIdOrName) => {

    }
    enqueueLinks: RestrictedCrawlingContext['enqueueLinks'] = async (options) => {

    }
    addRequests: RestrictedCrawlingContext['addRequests'] = async (requests, options) => {

    }
    useState: RestrictedCrawlingContext['useState'] = async (defaultValue) => {

    }
    getKeyValueStore: RestrictedCrawlingContext['getKeyValueStore'] = async (idOrName) => {
        return {
            id: idOrName,
            name: idOrName,
            getValue: (key) => {},
            getAutoSavedValue: (key, defaultValue) => {},
            setValue: (key, value, options) => {

            },
        }
    }
}

export class AdaptivePlaywrightCrawler extends PlaywrightCrawler {
    private _requestHandler: AdaptivePlaywrightCrawlerOptions['requestHandler'];

    constructor({ requestHandler, ...options }: AdaptivePlaywrightCrawlerOptions) {
        super({
            ...options,
            requestHandler: async (context) => {
                await this._requestHandler({ ...context, dom: playwrightLocatorPortadom(context.page.locator(':root'), context.page) });
            }
        });
        this._requestHandler = requestHandler;
    }

    protected override async _runRequestHandler(context: PlaywrightCrawlingContext<Dictionary>): Promise<void> {
        let shouldDetectRenderingType = false
        let renderingType: 'static' | 'clientOnly' = 'static'

    }

    protected async commitResult(context: PlaywrightCrawlingContext<Dictionary>, result: RequestHandlerResult): Promise<void> {

    }

    protected async runRequestHandlerInBrowser(context: PlaywrightCrawlingContext<Dictionary>): Promise<RequestHandlerResult> {

    }

    protected async runRequestHandlerWithPlainHTTP(context: PlaywrightCrawlingContext<Dictionary>): Promise<RequestHandlerResult> {

    }
}
