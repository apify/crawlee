import { cryptoRandomObjectId } from '@apify/utilities';
import { BaseHttpClient, ProxyConfiguration, ProxyInfo } from '@crawlee/core';
import { Impit, ImpitHttpClient } from '@crawlee/impit-client';
import { ResourceOwner } from '@crawlee/basic';
import { CookieJar } from 'tough-cookie';

export interface HttpUserContext {
    httpClient: BaseHttpClient;
    proxyInfo?: ProxyInfo;
    cookieJar: CookieJar;
}

interface HttpUserOptions {
    proxyConfiguration?: ProxyConfiguration;
    cookieJar?: CookieJar;
    id?: string;
}

export class HttpUser extends ResourceOwner<HttpUserContext> {
    private proxyConfiguration?: ProxyConfiguration;
    private httpClient?: BaseHttpClient;
    private proxyInfo?: ProxyInfo;
    private cookieJar: CookieJar = new CookieJar();

    constructor(options?: HttpUserOptions) {
        super();

        this.id = options?.id ?? cryptoRandomObjectId();
        this.cookieJar = options?.cookieJar ?? new CookieJar();
        this.proxyConfiguration = options?.proxyConfiguration;
        this.proxyInfo = undefined;
    }

    public async runTask(task: any) {
        this.proxyInfo ??= await this.proxyConfiguration?.newProxyInfo();

        this.httpClient ??= new ImpitHttpClient({
            explicitImpitInstance: new Impit({
                cookieJar: this.cookieJar,
                browser: 'firefox',
                proxyUrl: this.proxyInfo?.url,
            }),
        });

        console.log(`Running task with user ${this.id}!`);

        return await task({
            httpClient: this.httpClient,
            proxyInfo: this.proxyInfo,
            cookieJar: this.cookieJar,
        });
    }

    public isIdle(): boolean {
        // the http client doesn't have internal state (besides cookies), so we can consider it always idle
        return true;
    }
}
