import type { ISession, SessionFingerprint } from '@crawlee/types';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import type { FingerprintInjector } from 'fingerprint-injector';

import type { BrowserController } from '../abstract-classes/browser-controller.js';
import type { BrowserPool } from '../browser-pool.js';
import type { LaunchContext } from '../launch-context.js';
import { PlaywrightPlugin } from '../playwright/playwright-plugin.js';
import { PuppeteerPlugin } from '../puppeteer/puppeteer-plugin.js';
import { getGeneratorDefaultOptions } from './utils.js';

function deriveSessionFingerprint(payload: BrowserFingerprintWithHeaders): SessionFingerprint {
    const { navigator } = payload.fingerprint;
    const userAgent = navigator.userAgent;
    const ua = userAgent.toLowerCase();

    let browser: SessionFingerprint['browser'];
    if (ua.includes('edg/')) browser = 'edge';
    else if (ua.includes('firefox')) browser = 'firefox';
    else if (ua.includes('chrome')) browser = 'chrome';
    else if (ua.includes('safari')) browser = 'safari';

    let platform: SessionFingerprint['platform'];
    const platformHint = navigator.platform?.toLowerCase() ?? '';
    if (platformHint.includes('win')) platform = 'windows';
    else if (platformHint.includes('mac')) platform = 'macos';
    else if (platformHint.includes('linux')) platform = 'linux';
    else if (platformHint.includes('android')) platform = 'android';
    else if (platformHint.includes('iphone') || platformHint.includes('ipad')) platform = 'ios';

    return {
        userAgent,
        headers: payload.headers,
        browser,
        platform,
        device: navigator.userAgentData?.mobile ? 'mobile' : 'desktop',
        locales: navigator.languages,
        browserFingerprint: payload,
    };
}

/**
 * @internal
 */
export function createFingerprintPreLaunchHook(browserPool: BrowserPool<any, any, any, any, any>) {
    const {
        fingerprintGenerator,
        fingerprintCache,
        fingerprintOptions: { fingerprintGeneratorOptions },
    } = browserPool;

    return (_pageId: string, launchContext: LaunchContext) => {
        const { useIncognitoPages } = launchContext;
        const session = launchContext.session as ISession | undefined;
        const cacheKey = session?.id ?? launchContext.proxyUrl;
        const { launchOptions }: { launchOptions: any } = launchContext;

        // If no options are passed we try to pass best default options as possible to match browser and OS.
        const fingerprintGeneratorFinalOptions =
            fingerprintGeneratorOptions || getGeneratorDefaultOptions(launchContext);
        let fingerprint: BrowserFingerprintWithHeaders;

        const sessionFingerprint = session?.fingerprint?.browserFingerprint as
            | BrowserFingerprintWithHeaders
            | undefined;

        if (sessionFingerprint) {
            fingerprint = sessionFingerprint;
            if (cacheKey) fingerprintCache?.set(cacheKey, fingerprint);
        } else if (cacheKey && fingerprintCache?.has(cacheKey)) {
            fingerprint = fingerprintCache.get(cacheKey)!;
        } else if (cacheKey) {
            fingerprint = fingerprintGenerator!.getFingerprint(fingerprintGeneratorFinalOptions);
            fingerprintCache?.set(cacheKey, fingerprint);
        } else {
            fingerprint = fingerprintGenerator!.getFingerprint(fingerprintGeneratorFinalOptions);
        }

        if (session && !session.fingerprint?.browserFingerprint) {
            session.fingerprint = deriveSessionFingerprint(fingerprint);
        }

        launchContext.extend({ fingerprint });

        if (useIncognitoPages) {
            return;
        }
        const {
            navigator: { userAgent },
            screen,
        } = fingerprint.fingerprint!;

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
            pageOptions.userAgent ??= fingerprint.navigator.userAgent;
            pageOptions.viewport ??= {
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
