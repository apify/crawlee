import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { serviceLocator } from '@crawlee/basic';
import type { Config, ContentScriptMessage, IndexedCMPRuleset, RuleBundle } from '@duckduckgo/autoconsent';

// `require.resolve` picks the CommonJS bundle, which - unlike the ESM one - can be injected into a page as is.
const require = createRequire(import.meta.url);

/**
 * The [autoconsent configuration](https://github.com/duckduckgo/autoconsent/blob/main/docs/api.md), passed
 * through as is. `enabled` and `isMainWorld` are managed by Crawlee and are therefore not accepted.
 */
export interface CloseCookieModalsOptions extends Partial<Omit<Config, 'enabled' | 'isMainWorld'>> {
    /**
     * How long to wait for the consent flow to finish, in milliseconds. On pages without a cookie modal,
     * the detection keeps retrying until this timeout is reached.
     * @default 10_000
     */
    timeoutMillis?: number;
}

/**
 * The subset of the Playwright and Puppeteer `Frame` APIs needed to run autoconsent.
 * @internal
 */
export interface EvaluableFrame {
    url(): string;
    evaluate(pageFunction: any, arg?: any): Promise<any>;
}

/**
 * The subset of the Playwright and Puppeteer `Page` APIs needed to run autoconsent.
 * @internal
 */
export interface EvaluablePage extends EvaluableFrame {
    frames(): EvaluableFrame[];
    mainFrame(): EvaluableFrame;
}

let injectableScript: string | undefined;
let compactRules: IndexedCMPRuleset | undefined;
let fullRules: RuleBundle['autoconsent'] | undefined;

async function getInjectableScript() {
    injectableScript ??= `(() => {
        const module = { exports: {} };
        const exports = module.exports;
        ${await readFile(require.resolve('@duckduckgo/autoconsent'), 'utf8')}
        globalThis.crawleeAutoconsent = module.exports;
    })()`;

    return injectableScript;
}

async function getCompactRules() {
    compactRules ??= JSON.parse(
        await readFile(require.resolve('@duckduckgo/autoconsent/rules/compact-rules.json'), 'utf8'),
    ) as IndexedCMPRuleset;

    return compactRules;
}

/** The compact ruleset omits the opt-in steps, so opting in needs the (much larger) full ruleset. */
async function getFullRules() {
    fullRules ??= (
        JSON.parse(await readFile(require.resolve('@duckduckgo/autoconsent/rules/rules.json'), 'utf8')) as RuleBundle
    ).autoconsent;

    return fullRules;
}

/**
 * Runs the autoconsent content script in the given frame and waits until it handles a consent popup,
 * reports that there is none, or times out.
 */
async function closeCookieModalsInFrame(
    frame: EvaluableFrame,
    mainFrame: boolean,
    timeoutMillis: number,
    config: Partial<Config>,
) {
    const { filterCompactRules } = await import('@duckduckgo/autoconsent');

    const rules: RuleBundle =
        config.autoAction === 'optIn'
            ? { autoconsent: await getFullRules() }
            : {
                  autoconsent: [],
                  compact: filterCompactRules(await getCompactRules(), { url: frame.url(), mainFrame }),
              };

    await frame.evaluate(await getInjectableScript());
    await frame.evaluate(
        async ({ rules, timeoutMillis, config }: any) => {
            const AutoConsent = (globalThis as any).crawleeAutoconsent.default;

            await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, timeoutMillis);
                const finish = () => {
                    clearTimeout(timeout);
                    resolve();
                };

                const consent = new AutoConsent((message: ContentScriptMessage) => {
                    if (message.type === 'autoconsentDone') finish();
                    if (message.type === 'report' && message.state.lifecycle === 'nothingDetected') finish();
                });

                // We drive autoconsent from the page itself, so it has to evaluate its snippets there too.
                consent.initialize({ ...config, isMainWorld: true }, rules);
            });
        },
        { rules, timeoutMillis, config },
    );
}

/**
 * Tries to close cookie consent modals on the page using [autoconsent](https://github.com/duckduckgo/autoconsent).
 * @internal
 */
export async function closeCookieModals(page: EvaluablePage, options: CloseCookieModalsOptions = {}): Promise<void> {
    const { timeoutMillis = 10_000, ...config } = options;
    const mainFrame = page.mainFrame();

    // Some consent popups (e.g. Sourcepoint) live in an iframe and can only be handled from inside it.
    await Promise.all(
        page.frames().map(async (frame) => {
            // Frames that navigate or detach mid-flight reject the evaluation, there is nothing to act on.
            await closeCookieModalsInFrame(frame, frame === mainFrame, timeoutMillis, config).catch((error) =>
                serviceLocator.getChildLog('Cookie Consent').debug('Failed to handle cookie modals', { error }),
            );
        }),
    );
}
