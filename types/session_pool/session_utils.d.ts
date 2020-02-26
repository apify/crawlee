/// <reference types="node" />
export function getCookiesFromResponse(response: IncomingMessage | PuppeteerResponse): any[] | undefined;
import { IncomingMessage } from "http";
import { Response as PuppeteerResponse } from "puppeteer";
