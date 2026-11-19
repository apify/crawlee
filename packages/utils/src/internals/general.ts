import { setTimeout } from 'node:timers/promises';

/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 */
export const URL_NO_COMMAS_REGEX =
    /https?:\/\/(www\.)?([\p{L}0-9]|[\p{L}0-9][-\p{L}\p{M}0-9@:%._+~#=]{0,254}[\p{L}\p{M}0-9])\.(xn--[a-z0-9-]{1,59}|[a-z]{2,63}|[\p{L}\p{M}]{2,63})(:\d{1,5})?(\/[-\p{L}\p{M}0-9@:%_+.~#?&/=()'*]*)?/giu;

/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 */
export const URL_WITH_COMMAS_REGEX =
    /https?:\/\/(www\.)?([\p{L}0-9]|[\p{L}0-9][-\p{L}\p{M}0-9@:%._+~#=]{0,254}[\p{L}\p{M}0-9])\.(xn--[a-z0-9-]{1,59}|[a-z]{2,63}|[\p{L}\p{M}]{2,63})(:\d{1,5})?(\/[-\p{L}\p{M}0-9@:%_+,.~#?&/=()'*]*)?/giu;

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

/**
 * Serializes the page and collects its `iframe` elements. Runs in the browser, in a single call, so the HTML
 * and the elements describe the same state of the page. In the HTML, every collected iframe carries its index
 * in the `data-crawlee-iframe-id` attribute.
 * @ignore
 */
export function snapshotPageWithIframes(
    document: Document,
    serialize: ((document: Document) => string) | null,
): { html: string; iframes: Element[] } {
    const attribute = 'data-crawlee-iframe-id';

    document.querySelectorAll('iframe').forEach((iframe, index) => iframe.setAttribute(attribute, String(index)));

    let html: string;
    if (serialize) {
        html = serialize(document);
    } else {
        // Same output as `page.content()`.
        const doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) : '';
        html = doctype + document.documentElement.outerHTML;
    }

    // Looked up only now, as `expandShadowRoots` re-creates the light DOM of shadow hosts.
    const iframes: Element[] = [];
    for (const iframe of document.querySelectorAll(`iframe[${attribute}]`)) {
        iframes[Number(iframe.getAttribute(attribute))] ??= iframe;
        iframe.removeAttribute(attribute);
    }

    return { html, iframes };
}
