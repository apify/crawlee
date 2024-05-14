/* eslint-disable @typescript-eslint/ban-types */

/** @ignore */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** @ignore */
export type Awaitable<T> = T | PromiseLike<T>;

/** @ignore */
export function entries<T extends {}>(obj: T) {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
}

/** @ignore */
export function keys<T extends {}>(obj: T) {
    return Object.keys(obj) as (keyof T)[];
}

export declare type AllowedHttpMethods = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';

// Define the following types as we cannot import the complete types from the respective packages
export interface PlaywrightCrawlingContext {
    saveSnapshot: (options: { key: string }) => Promise<void>;
}
export interface PuppeteerCrawlingContext {
    saveSnapshot: (options: { key: string }) => Promise<void>;
}
export interface PlaywrightPage {
    content: () => Promise<string>;
}
export interface PuppeteerPage {
    content: () => Promise<string>;
}

export interface SnapshotOptions { context: PlaywrightCrawlingContext | PuppeteerCrawlingContext; filename: string }
export type SnapshotResult = { screenshotFilename?: string; htmlFileName?: string } | undefined;
