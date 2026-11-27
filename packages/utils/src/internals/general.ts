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
    // The copy lives in an inert document, so the page is left as it is and nothing in the copy runs or loads.
    const copy = document.implementation.createHTMLDocument('');
    const root = copy.importNode(document.documentElement, true);

    // Appends the content of every open shadow root to the copy of its host.
    function expand(original: Element, clone: Element) {
        const children = Array.from(original.children, (child, index) => [child, clone.children[index]]);

        for (const node of Array.from(original.shadowRoot?.childNodes ?? [])) {
            const imported = clone.appendChild(copy.importNode(node, true));

            if (node.nodeType === Node.ELEMENT_NODE) {
                children.push([node as Element, imported as Element]);
            }
        }

        for (const [child, childClone] of children) {
            expand(child, childClone);
        }
    }

    expand(document.documentElement, root);

    return root.outerHTML;
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
    const iframes: Element[] = [];

    // Shadow roots are only searched when their content gets into the snapshot.
    function collect(root: Document | ShadowRoot) {
        for (const element of root.querySelectorAll(serialize ? '*' : 'iframe')) {
            if (element.localName === 'iframe') {
                iframes.push(element);
            }

            if (element.shadowRoot) {
                collect(element.shadowRoot);
            }
        }
    }

    collect(document);
    iframes.forEach((iframe, index) => iframe.setAttribute(attribute, String(index)));

    let html: string;
    if (serialize) {
        html = serialize(document);
    } else {
        // Same output as `page.content()`.
        const doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) : '';
        html = doctype + document.documentElement.outerHTML;
    }

    iframes.forEach((iframe) => iframe.removeAttribute(attribute));

    return { html, iframes };
}
