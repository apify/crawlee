import type { PlaywrightPlugin, PuppeteerPlugin } from '.';
import type { BrowserPlugin } from './abstract-classes/browser-plugin';
export type UnwrapPromise<T> = T extends PromiseLike<infer R> ? UnwrapPromise<R> : T;
export declare function noop(..._args: unknown[]): void;
/**
 * This is required when using optional dependencies.
 * Importing a type gives `any`, but `Parameters<any>` gives `unknown[]` instead of `any`
 */
export type SafeParameters<T extends (...args: any) => any> = unknown[] extends Parameters<T> ? any : Parameters<T>;
export type InferBrowserPluginArray<Input extends readonly unknown[], Result extends BrowserPlugin[] = []> = Input extends readonly [infer FirstValue, ...infer Rest] | [infer FirstValue, ...infer Rest] ? FirstValue extends PlaywrightPlugin ? InferBrowserPluginArray<Rest, [...Result, PlaywrightPlugin]> : FirstValue extends PuppeteerPlugin ? InferBrowserPluginArray<Rest, [...Result, PuppeteerPlugin]> : never : Input extends [] ? Result : Input extends (infer U)[] ? [U] extends [PuppeteerPlugin | PlaywrightPlugin] ? U[] : never : Result;
//# sourceMappingURL=utils.d.ts.map