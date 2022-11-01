import type { PlaywrightPlugin, PuppeteerPlugin } from '.';
import type { BrowserPlugin } from './abstract-classes/browser-plugin';

export type UnwrapPromise<T> = T extends PromiseLike<infer R> ? UnwrapPromise<R> : T;

export function noop(..._args: unknown[]): void {}

/**
 * This is required when using optional dependencies.
 * Importing a type gives `any`, but `Parameters<any>` gives `unknown[]` instead of `any`
 */
export type SafeParameters<T extends (...args: any) => any> = unknown[] extends Parameters<T> ? any : Parameters<T>;

export type InferBrowserPluginArray<
    // The original array input
    Input extends readonly unknown[],
    // The results of this type
    Result extends BrowserPlugin[] = []
> =
    // If the input is a tuple or a readonly array (`[] as const`), get the first and the rest of the values
    Input extends readonly [infer FirstValue, ...infer Rest] | [infer FirstValue, ...infer Rest]
    // If the first value is a PlaywrightPlugin
    ? FirstValue extends PlaywrightPlugin
        // Add it to the result, and continue parsing
        ? InferBrowserPluginArray<Rest, [...Result, PlaywrightPlugin]>
        // Else if the first value is a PuppeteerPlugin
        : FirstValue extends PuppeteerPlugin
            // Add it to the result, and continue parsing
            ? InferBrowserPluginArray<Rest, [...Result, PuppeteerPlugin]>
            // Return never as it isn't a valid type
            : never
    // If there's no more inputs to parse
    : Input extends []
        // Return the results
        ? Result
        // If the input is a general array of elements (not a tuple), infer it's values type
        : Input extends (infer U)[]
            // If the values are a union of the plugins
            ? [U] extends [PuppeteerPlugin | PlaywrightPlugin]
                // Return an array of the union
                ? U[]
                // Return never as it isn't a valid type
                : never
            // Return the result
            : Result;
