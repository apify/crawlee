import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import type { FingerprintInjector } from 'fingerprint-injector';
import type { BrowserPool } from '..';
import { PuppeteerPlugin } from '../puppeteer/puppeteer-plugin';
import { PlaywrightPlugin } from '../playwright/playwright-plugin';
import type { BrowserController } from '../abstract-classes/browser-controller';
import type { LaunchContext } from '../launch-context';
import { getGeneratorDefaultOptions } from './utils';

/**
 * @internal
 */
export function createFingerprintPreLaunchHook(browserPool: BrowserPool<any, any, any, any, any>) {
    const {
        fingerprintGenerator,
        fingerprintCache,
        fingerprintOptions: {
            fingerprintGeneratorOptions,
        },
    } = browserPool;

    return (_pageId: string, launchContext: LaunchContext) => {
        const { useIncognitoPages } = launchContext;
        const cacheKey = (launchContext.session as { id: string } | undefined)?.id ?? launchContext.proxyUrl;
        const { launchOptions }: { launchOptions: any } = launchContext;

        // If no options are passed we try to pass best default options as possible to match browser and OS.
        const fingerprintGeneratorFinalOptions = fingerprintGeneratorOptions || getGeneratorDefaultOptions(launchContext);
        let fingerprint : BrowserFingerprintWithHeaders;

        if (cacheKey && fingerprintCache?.has(cacheKey)) {
            fingerprint = fingerprintCache.get(cacheKey)!;
        } else if (cacheKey) {
            fingerprint = fingerprintGenerator!.getFingerprint(fingerprintGeneratorFinalOptions);
            fingerprintCache?.set(cacheKey, fingerprint);
        } else {
            fingerprint = fingerprintGenerator!.getFingerprint(fingerprintGeneratorFinalOptions);
        }

        launchContext.extend({ fingerprint });

        if (useIncognitoPages) {
            return;
        }
        const { navigator: { userAgent }, screen } = fingerprint.fingerprint!;

        launchOptions.userAgent = userAgent;

        launchOptions.viewport = {
            width: screen.width,
            height: screen.height,
        };
    };
}

/**
 * @internal
 */
export function createPrePageCreateHook() {
    return (_pageId: string, browserController: BrowserController, pageOptions: any): void => {
        const { launchContext, browserPlugin } = browserController;
        const { fingerprint } = launchContext.fingerprint!;

        if (launchContext.useIncognitoPages && browserPlugin instanceof PlaywrightPlugin && pageOptions) {
            pageOptions.userAgent = fingerprint.navigator.userAgent;
            pageOptions.viewport = {
                width: fingerprint.screen.width,
                height: fingerprint.screen.height,
            };
        }
    };
}

/**
 * @internal
 */
export function createPostPageCreateHook(fingerprintInjector: FingerprintInjector) {
    return async (page: any, browserController: BrowserController): Promise<void> => {
        const { browserPlugin, launchContext } = browserController;
        const fingerprint = launchContext.fingerprint!;

        // TODO this will require refactoring, we should use common API instead of branching based on plugin type,
        //  and there should be no public methods specific to some browser.
        if (browserPlugin instanceof PlaywrightPlugin) {
            const { useIncognitoPages, isFingerprintInjected } = launchContext;

            if (isFingerprintInjected) {
                // If not incognitoPages are used we would add the injection script over and over which could cause memory leaks.
                return;
            }

            const context = page.context();
            await fingerprintInjector.attachFingerprintToPlaywright(context, fingerprint);

            if (!useIncognitoPages) {
                // There is only one context
                // We would add the injection script over and over which could cause memory/cpu leaks.
                launchContext.extend({ isFingerprintInjected: true });
            }
        } else if (browserPlugin instanceof PuppeteerPlugin) {
            await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
        }
    };
}
