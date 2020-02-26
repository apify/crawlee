export function addInterceptRequestHandler(page: Page, handler: InterceptHandler): Promise<void>;
export function removeInterceptRequestHandler(page: Page, handler: InterceptHandler): Promise<void>;
export type InterceptHandler = (request: PuppeteerRequest) => any;
import { Page } from "puppeteer";
import { Request as PuppeteerRequest } from "puppeteer";
