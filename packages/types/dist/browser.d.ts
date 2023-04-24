import type { Dictionary } from './utility-types';
export interface Cookie {
    /**
     * Cookie name.
     */
    name: string;
    /**
     * Cookie value.
     */
    value: string;
    /**
     * The request-URI to associate with the setting of the cookie. This value can affect the
     * default domain, path, source port, and source scheme values of the created cookie.
     */
    url?: string;
    /**
     * Cookie domain.
     */
    domain?: string;
    /**
     * Cookie path.
     */
    path?: string;
    /**
     * True if cookie is secure.
     */
    secure?: boolean;
    /**
     * True if cookie is http-only.
     */
    httpOnly?: boolean;
    /**
     * Cookie SameSite type.
     */
    sameSite?: 'Strict' | 'Lax' | 'None';
    /**
     * Cookie expiration date, session cookie if not set
     */
    expires?: number;
    /**
     * Cookie Priority.
     */
    priority?: 'Low' | 'Medium' | 'High';
    /**
     * True if cookie is SameParty.
     */
    sameParty?: boolean;
    /**
     * Cookie source scheme type.
     */
    sourceScheme?: 'Unset' | 'NonSecure' | 'Secure';
    /**
     * Cookie source port. Valid values are `-1` or `1-65535`, `-1` indicates an unspecified port.
     * An unspecified port value allows protocol clients to emulate legacy cookie scope for the port.
     * This is a temporary ability and it will be removed in the future.
     */
    sourcePort?: number;
}
export interface BrowserLikeResponse {
    url(): string;
    headers(): Dictionary<string | string[]>;
}
//# sourceMappingURL=browser.d.ts.map