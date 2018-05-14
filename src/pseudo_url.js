import _ from 'underscore';
import log from 'apify-shared/log';

/**
 * Represents a pseudo URL (PURL), which is simply a URL with special directives enclosed in [] brackets.
 * Currently, the only supported directive is [regexp], which defines a JavaScript-style regular expression to match against the URL.
 *
 * For example, a PURL `http://www.example.com/pages/[(\w|-)*]` will match all of the following URLs:
 *
 * <ul>
 *     <li>`http://www.example.com/pages/`</li>
 *     <li>`http://www.example.com/pages/my-awesome-page`</li>
 *     <li>`http://www.example.com/pages/something`</li>
 * </ul>
 *
 * Example use:
 *
 * ```javascript
 * const purl = new Apify.PseudoUrl('http://www.example.com/pages/[(\w|-)*]');
 *
 * if (purl.matches('http://www.example.com/pages/my-awesome-page')) console.log('Match!');
 * ```
 *
 * @param {String} purl Pseudo url.
 */
export default class PseudoUrl {
    constructor(purl) {
        purl = _.isString(purl) ? purl.trim() : '';
        if (purl.length === 0) throw new Error(`Cannot parse PURL '${purl}': it must be an non-empty string`);

        // Generate a regular expression from the pseudo-URL
        // TODO: if input URL contains '[' or ']', they should be matched their URL-escaped counterparts !!!
        try {
            let regex = '^';
            let openBrackets = 0;
            for (let i = 0; i < purl.length; i++) {
                const ch = purl.charAt(i);

                if (ch === '[' && ++openBrackets === 1) {
                    // Beginning of '[regex]' section
                    // Enclose regex in () brackets to enforce operator priority
                    regex += '(';
                } else if (ch === ']' && openBrackets > 0 && --openBrackets === 0) {
                    // End of '[regex]' section
                    regex += ')';
                } else if (openBrackets > 0) {
                    // Inside '[regex]' section
                    regex += ch;
                } else {
                    // Outside '[regex]' section, parsing the URL part
                    const code = ch.charCodeAt(0);
                    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
                        // Alphanumeric character => copy it.
                        regex += ch;
                    } else {
                        // Special character => escape it
                        const hex = code < 16 ? `0${code.toString(16)}` : code.toString(16);
                        regex += `\\x${hex}`;
                    }
                }
            }
            regex += '$';
            this.regExpString = regex; // useful for debugging, prepared config is printed out including this filed
            this.regExp = new RegExp(regex);

            log.debug('PURL parsed', { purl, regex });
        } catch (e) {
            throw new Error(`Cannot parse PURL '${purl}': ${e}`);
        }
    }

    /**
     * Determines whether a URL matches this pseudo-URL pattern.
     *
     * @param {String} url URL to be matched.
     * @return {Boolean} Returns `true` if given URL matches pseudo URL.
     */
    matches(url) {
        return _.isString(url) && url.match(this.regExp) !== null;
    }
}
