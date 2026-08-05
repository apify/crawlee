import type { CrawlingContext } from '@crawlee/basic';
import type { CheerioCrawlerOptions } from '@crawlee/cheerio';
import type { InternalHttpHook } from '@crawlee/http';
import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext, PlaywrightHook } from '@crawlee/playwright';
import type { PuppeteerCrawlerOptions, PuppeteerCrawlingContext, PuppeteerHook } from '@crawlee/puppeteer';
import type { StagehandCrawlerOptions, StagehandCrawlingContext, StagehandHook } from '@crawlee/stagehand';
import type { Dictionary } from '@crawlee/types';

/**
 * Type-level regression test for https://github.com/apify/crawlee/issues/2063.
 */

interface OrderUserData extends Dictionary {
    label: string;
}

describe('navigation hook option types (#2063)', () => {
    test('puppeteer - hooks with explicitly typed context stay assignable', () => {
        const preNavigationHook = async ({ request, gotoOptions }: PuppeteerCrawlingContext<OrderUserData>) => {
            void request.userData.label;
            gotoOptions.timeout = 60_000;
        };
        const postNavigationHook = async ({ request }: PuppeteerCrawlingContext<OrderUserData>) =>
            void request.userData.label;

        const options: PuppeteerCrawlerOptions = {
            preNavigationHooks: [preNavigationHook],
            postNavigationHooks: [postNavigationHook],
        };

        expect(options).toBeTruthy();
    });

    test('puppeteer - hooks typed via the PuppeteerHook generic', () => {
        const hook: PuppeteerHook<OrderUserData> = async ({ request }) => void request.userData.label;

        const options: PuppeteerCrawlerOptions = {
            preNavigationHooks: [hook],
            postNavigationHooks: [hook],
        };

        expect(options).toBeTruthy();
    });

    test('playwright - hooks with explicitly typed context stay assignable', () => {
        const preNavigationHook = async ({ request, gotoOptions }: PlaywrightCrawlingContext<OrderUserData>) => {
            void request.userData.label;
            gotoOptions.timeout = 60_000;
        };
        const postNavigationHook = async ({ request }: PlaywrightCrawlingContext<OrderUserData>) =>
            void request.userData.label;

        const options: PlaywrightCrawlerOptions = {
            preNavigationHooks: [preNavigationHook],
            postNavigationHooks: [postNavigationHook],
        };

        expect(options).toBeTruthy();
    });

    test('playwright - hooks typed via the PlaywrightHook generic', () => {
        const hook: PlaywrightHook<OrderUserData> = async ({ request }) => void request.userData.label;

        const options: PlaywrightCrawlerOptions = {
            preNavigationHooks: [hook],
            postNavigationHooks: [hook],
        };

        expect(options).toBeTruthy();
    });

    test('stagehand - hooks with explicitly typed context stay assignable', () => {
        const preNavigationHook = async ({ request, gotoOptions }: StagehandCrawlingContext<OrderUserData>) => {
            void request.userData.label;
            gotoOptions.timeout = 60_000;
        };
        const postNavigationHook = async ({ request }: StagehandCrawlingContext<OrderUserData>) =>
            void request.userData.label;

        const options: StagehandCrawlerOptions = {
            preNavigationHooks: [preNavigationHook],
            postNavigationHooks: [postNavigationHook],
        };

        expect(options).toBeTruthy();
    });

    test('stagehand - hooks typed via the StagehandHook generic', () => {
        const hook: StagehandHook<OrderUserData> = async ({ request }) => void request.userData.label;

        const options: StagehandCrawlerOptions = {
            preNavigationHooks: [hook],
            postNavigationHooks: [hook],
        };

        expect(options).toBeTruthy();
    });

    test('cheerio - pre-navigation hook typed with custom user data stays assignable', () => {
        const hook: InternalHttpHook<CrawlingContext<OrderUserData>> = async ({ request }) =>
            void request.userData.label;

        const options: CheerioCrawlerOptions = {
            preNavigationHooks: [hook],
        };

        expect(options).toBeTruthy();
    });
});
