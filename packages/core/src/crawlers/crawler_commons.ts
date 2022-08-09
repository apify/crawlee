import type { Dictionary } from '@crawlee/types';
import type { Log } from '../log';
import type { ProxyInfo } from '../proxy_configuration';
import type { Request } from '../request';
import type { Session } from '../session_pool/session';

export interface CrawlingContext<UserData extends Dictionary = Dictionary> extends Record<PropertyKey, unknown> {
    id: string;
    /**
     * The original {@apilink Request} object.
     */
    request: Request<UserData>;
    session?: Session;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@apilink ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;
    log: Log;
}
