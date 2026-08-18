export function noop(..._args) { }
/**
 * Strips secrets from a URL so it can be safely included in logs and error messages. Removes userinfo
 * credentials and the entire query string and fragment — remote browser services routinely carry tokens
 * there (e.g. Browserless `?token=…`), and we can't tell which params are sensitive. Keeps the
 * protocol, host, port, and path, which are enough to diagnose connection failures.
 */
export function sanitizeEndpointForLog(endpoint) {
    try {
        const url = new URL(endpoint);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString();
    }
    catch {
        return '<invalid URL>';
    }
}
