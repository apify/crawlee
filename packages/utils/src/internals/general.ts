import { setTimeout } from 'node:timers/promises';

/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 */
export const URL_NO_COMMAS_REGEX =
    /https?:\/\/(www\.)?([\p{L}0-9]|[\p{L}0-9][-\p{L}0-9@:%._+~#=]{0,254}[\p{L}0-9])\.[a-z]{2,63}(:\d{1,5})?(\/[-\p{L}0-9@:%_+.~#?&/=()'*]*)?/giu;

/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 */
export const URL_WITH_COMMAS_REGEX =
    /https?:\/\/(www\.)?([\p{L}0-9]|[\p{L}0-9][-\p{L}0-9@:%._+~#=]{0,254}[\p{L}0-9])\.[a-z]{2,63}(:\d{1,5})?(\/[-\p{L}0-9@:%_+,.~#?&/=()'*]*)?/giu;

/**
 * Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting
 * in your code, e.g. to prevent overloading of target website or to avoid bot detection.
 *
 * **Example usage:**
 *
 * ```
 * import { sleep } from 'crawlee';
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await sleep(1500);
 * ```
 * @param millis Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.
 */
export async function sleep(millis?: number): Promise<void> {
    return setTimeout(millis ?? undefined);
}

/**
 * Traverses DOM and expands shadow-root elements (created by custom components).
 * @ignore
 */
export function expandShadowRoots(document: Document): string {
    // Returns HTML of given shadow DOM.
    function getShadowDomHtml(shadowRoot: any) {
        let shadowHTML = '';

        for (const el of shadowRoot.childNodes) {
            shadowHTML += el.nodeValue ?? el.outerHTML ?? '';
        }

        return shadowHTML;
    }

    // Recursively replaces shadow DOMs with their HTML.
    function replaceShadowDomsWithHtml(rootElement: any) {
        for (const el of rootElement.querySelectorAll('*')) {
            if (el.shadowRoot) {
                replaceShadowDomsWithHtml(el.shadowRoot);
                let content = el.getHTML?.({ serializableShadowRoots: true }).trim();

                if (!(content?.length > 0)) {
                    content = getShadowDomHtml(el.shadowRoot) ?? '';
                }
                el.innerHTML += content;
            }
        }
    }

    replaceShadowDomsWithHtml(document.body);

    return document.documentElement.outerHTML;
}
