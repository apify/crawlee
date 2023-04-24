"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPostPageCreateHook = exports.createPrePageCreateHook = exports.createFingerprintPreLaunchHook = void 0;
const puppeteer_plugin_1 = require("../puppeteer/puppeteer-plugin");
const playwright_plugin_1 = require("../playwright/playwright-plugin");
const utils_1 = require("./utils");
/**
 * @internal
 */
function createFingerprintPreLaunchHook(browserPool) {
    const { fingerprintGenerator, fingerprintCache, fingerprintOptions: { fingerprintGeneratorOptions, }, } = browserPool;
    return (_pageId, launchContext) => {
        const { useIncognitoPages } = launchContext;
        const cacheKey = launchContext.session?.id ?? launchContext.proxyUrl;
        const { launchOptions } = launchContext;
        // If no options are passed we try to pass best default options as possible to match browser and OS.
        const fingerprintGeneratorFinalOptions = fingerprintGeneratorOptions || (0, utils_1.getGeneratorDefaultOptions)(launchContext);
        let fingerprint;
        if (cacheKey && fingerprintCache?.has(cacheKey)) {
            fingerprint = fingerprintCache.get(cacheKey);
        }
        else if (cacheKey) {
            fingerprint = fingerprintGenerator.getFingerprint(fingerprintGeneratorFinalOptions);
            fingerprintCache?.set(cacheKey, fingerprint);
        }
        else {
            fingerprint = fingerprintGenerator.getFingerprint(fingerprintGeneratorFinalOptions);
        }
        launchContext.extend({ fingerprint });
        if (useIncognitoPages) {
            return;
        }
        const { navigator: { userAgent }, screen } = fingerprint.fingerprint;
        launchOptions.userAgent = userAgent;
        launchOptions.viewport = {
            width: screen.width,
            height: screen.height,
        };
    };
}
exports.createFingerprintPreLaunchHook = createFingerprintPreLaunchHook;
/**
 * @internal
 */
function createPrePageCreateHook() {
    return (_pageId, browserController, pageOptions) => {
        const { launchContext, browserPlugin } = browserController;
        const { fingerprint } = launchContext.fingerprint;
        if (launchContext.useIncognitoPages && browserPlugin instanceof playwright_plugin_1.PlaywrightPlugin && pageOptions) {
            pageOptions.userAgent = fingerprint.navigator.userAgent;
            pageOptions.viewport = {
                width: fingerprint.screen.width,
                height: fingerprint.screen.height,
            };
        }
    };
}
exports.createPrePageCreateHook = createPrePageCreateHook;
/**
 * @internal
 */
function createPostPageCreateHook(fingerprintInjector) {
    return async (page, browserController) => {
        const { browserPlugin, launchContext } = browserController;
        const fingerprint = launchContext.fingerprint;
        // TODO this will require refactoring, we should use common API instead of branching based on plugin type,
        //  and there should be no public methods specific to some browser.
        if (browserPlugin instanceof playwright_plugin_1.PlaywrightPlugin) {
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
        }
        else if (browserPlugin instanceof puppeteer_plugin_1.PuppeteerPlugin) {
            await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
        }
    };
}
exports.createPostPageCreateHook = createPostPageCreateHook;
//# sourceMappingURL=hooks.js.map