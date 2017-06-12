import _ from 'underscore';
import portastic from 'portastic';

/* globals process */

const PROXY_CHAIN_PORT_FROM = 50000;
const PROXY_CHAIN_PORT_TO = 60000;
const PROXY_CHAIN_HOST = '127.0.0.1';
const PROXY_CHAIN_PROTOCOL = 'http:';

export class ProxyChainManager {
    constructor() {
        // Dictionary of all proxy chains, key is Squid proxy port, value is parsed
        // URL of the original parent proxy.
        this.portToParsedProxyUrl = {};

        // PID of the Squid proxy process
        this.squidPid = null;
    }

    /**
     * Sets up an open child proxy which forwards to a specified parent proxy with authentication.
     * @param parsedChildProxyUrl Parsed URL of the parent proxy.
     * @return Promise Promise resolving to the parsed URL of the child proxy.
     */
    addProxyChain(parsedProxyUrl) {
        let parsedChildProxyUrl;
        return ProxyChainManager._findFreePort()
        .then((port) => {
            this.portToParsedProxyUrl[port] = _.clone(parsedProxyUrl);
            parsedChildProxyUrl = parseUrl(`${PROXY_CHAIN_PROTOCOL}//${PROXY_CHAIN_HOST}:${port}`);
            return this._manageSquidProcess();
        })
        .then(() => {
            return parsedChildProxyUrl;
        });
    }

    /**
     * Removes a child proxy.
     * @param childParsedUrl Result of the previous call from the addProxyChain() function.
     * @return Promise Returns a promise that resolves when the proxy chain is reconfigured.
     */
    removeProxyChain(parsedChildProxyUrl) {
        if (parsedChildProxyUrl.protocol === PROXY_CHAIN_PROTOCOL
            && parsedChildProxyUrl.host === PROXY_CHAIN_HOST
            && this.portToParsedProxyUrl[parsedChildProxyUrl.port]) {
            delete this.portToParsedProxyUrl[parsedChildProxyUrl.port];
            return this._manageSquidProcess();
        }
    }

    static _findFreePort() {
        return portastic.find({
            min: PROXY_CHAIN_PORT_FROM,
            max: PROXY_CHAIN_PORT_TO,
            retrieve: 1,
        })
        .then((ports) => {
            if (ports.length < 1) throw new Error(`There are no more free ports in range from ${PROXY_CHAIN_PORT_FROM} to ${PROXY_CHAIN_PORT_TO}`);
            return ports[0];
        });
    }

    /**
     * Manages Squid proxy process, which means the function either starts it, updates its configuration or kills it,
     * depending on the state of the `portToParsedProxyUrl` field.
     * @private
     */
    _manageSquidProcess() {
        // First, check whether the Squid process is still running
        // (inspired by https://github.com/nisaacson/is-running/blob/master/index.js)
        if (this.squidPid) {
            let isRunning;
            try {
                isRunning = !!process.kill(this.squidPid, 0);
            } catch (e) {
                isRunning = e.code === 'EPERM';
            }
            if (!isRunning) this.squidPid = null;
        }

        // If Squid shouldn't be running but sill is, kill it
        if (_.isEmpty(this.portToParsedProxyUrl)) {
            if (this.squidPid) {
                process.kill(this.squidPid);
                this.squidPid = null;
            }
            return;
        }

        const squidConf = this._generateSquidConf();

        if (!this.squidPid) {
            // Squid is not running => start it
            // TODO
        } else {
            // Squid is already running => reconfigure it
            // TODO
        }
    }

    static _generateSquidConfForPort(parsedProxyUrl, squidPort) {
        const peerName = `peer${squidPort}`;
        const aclName = `acl${squidPort}`;
        const str = `http_port ${squidPort}\n`
            + `cache_peer ${parsedProxyUrl.host} parent ${parsedProxyUrl.port} 0 no-query login=${parsedProxyUrl.auth} connect-fail-limit=99999999 proxy-only name=${peerName}\n` // eslint-disable-line max-len
            + `acl ${aclName} myport ${squidPort}\n`
            + `cache_peer_access ${peerName} allow ${aclName}\n`;
        return str;
    }

    _generateSquidConf() {
        const chainConfs = _.mapObject(this.portToParsedProxyUrl, (parsedProxyUrl, port) => {
            return this._generateSquidConfForPort(parsedProxyUrl, port);
        }).join('\n');

        const conf = `
http_access allow all
never_direct allow all
access_log none
cache_store_log none
cache_log /dev/null
logfile_rotate 0

${chainConfs}
`;
        return conf;
    }
}
