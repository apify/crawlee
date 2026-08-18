import type { BrowserPlugin } from './abstract-classes/browser-plugin.js';
import type { PlaywrightPlugin } from './playwright/playwright-plugin.js';
import type { PuppeteerPlugin } from './puppeteer/puppeteer-plugin.js';
export type UnwrapPromise<T> = T extends PromiseLike<infer R> ? UnwrapPromise<R> : T;
export declare function noop(..._args: unknown[]): void;
/**
 * Strips secrets from a URL so it can be safely included in logs and error messages. Removes userinfo
 * credentials and the entire query string and fragment — remote browser services routinely carry tokens
 * there (e.g. Browserless `?token=…`), and we can't tell which params are sensitive. Keeps the
 * protocol, host, port, and path, which are enough to diagnose connection failures.
 */
export declare function sanitizeEndpointForLog(endpoint: string): string;
/**
 * This is required when using optional dependencies.
 * Importing a type gives `any`, but `Parameters<any>` gives `unknown[]` instead of `any`
 */
export type SafeParameters<T extends (...args: any) => any> = unknown[] extends Parameters<T> ? any : Parameters<T>;
export type InferBrowserPluginArray<Input extends readonly unknown[], Result extends BrowserPlugin[] = []> = Input extends readonly [infer FirstValue, ...infer Rest] | [infer FirstValue, ...infer Rest] ? FirstValue extends PlaywrightPlugin ? InferBrowserPluginArray<Rest, [...Result, PlaywrightPlugin]> : FirstValue extends PuppeteerPlugin ? InferBrowserPluginArray<Rest, [...Result, PuppeteerPlugin]> : never : Input extends [] ? Result : Input extends readonly (infer U)[] ? [
    U
] extends [PuppeteerPlugin | PlaywrightPlugin] ? U[] : never : Result;
