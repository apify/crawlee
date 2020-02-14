export function addInterceptRequestHandler(page: any, handler: InterceptHandler): Promise<void>;
export function removeInterceptRequestHandler(page: any, handler: InterceptHandler): Promise<void>;
export type InterceptHandler = (request: Request) => any;
import { Request } from "puppeteer";
