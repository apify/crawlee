import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { serviceLocator } from '@crawlee/basic';
import type { ContentScriptMessage, IndexedCMPRuleset, RuleBundle } from '@duckduckgo/autoconsent';

const require = createRequire(import.meta.url);

export interface CloseCookieModalsOptions {
    /**
     * Whether to reject (`optOut`) or accept (`optIn`) the cookie consent.
     * @default 'optOut'
     */
    mode?: 'optOut' | 'optIn';

    /**
     * How long to wait for the consent flow to finish, in milliseconds. On pages without a cookie modal,
     * the detection keeps retrying until this timeout is reached.
     * @default 10_000
     */
    timeoutMillis?: number;

    /**
     * Enables heuristic detection of cookie modals that no autoconsent rule matches. Since the buttons are
     * picked based on their text, this may interact with the page in unexpected ways.
     * @default false
     */
    enableHeuristicDetection?: boolean;
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
    options: Required<CloseCookieModalsOptions>,
) {
    const { filterCompactRules } = await import('@duckduckgo/autoconsent');

    const rules: RuleBundle =
        options.mode === 'optIn'
            ? { autoconsent: await getFullRules() }
            : {
                  autoconsent: [],
                  compact: filterCompactRules(await getCompactRules(), { url: frame.url(), mainFrame }),
              };

    await frame.evaluate(await getInjectableScript());
    await frame.evaluate(
        async ({ rules, mode, timeoutMillis, enableHeuristicDetection }: any) => {
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

                consent.initialize(
                    {
                        isMainWorld: true,
                        autoAction: mode,
                        enableHeuristicDetection,
                        heuristicMode: enableHeuristicDetection ? 'tier2' : 'off',
                    },
                    rules,
                );
            });
        },
        { ...options, rules },
    );
}

/**
 * Tries to close cookie consent modals on the page using [autoconsent](https://github.com/duckduckgo/autoconsent).
 * @internal
 */
export async function closeCookieModals(page: EvaluablePage, options: CloseCookieModalsOptions = {}): Promise<void> {
    const resolvedOptions: Required<CloseCookieModalsOptions> = {
        mode: 'optOut',
        timeoutMillis: 10_000,
        enableHeuristicDetection: false,
        ...options,
    };

    const mainFrame = page.mainFrame();

    // Some consent popups (e.g. Sourcepoint) live in an iframe and can only be handled from inside it.
    await Promise.all(
        page.frames().map(async (frame) => {
            // Frames that navigate or detach mid-flight reject the evaluation, there is nothing to act on.
            await closeCookieModalsInFrame(frame, frame === mainFrame, resolvedOptions).catch((error) =>
                serviceLocator.getChildLog('Cookie Consent').debug('Failed to handle cookie modals', { error }),
            );
        }),
    );
}
