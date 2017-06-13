import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import tmp from 'tmp';
import portastic from 'portastic';
import Promise from 'bluebird';
import { parseUrl } from './utils';

/* globals process */

// Exported to allow unit-testing
export const PROXY_CHAIN = {
    PORT_FROM: 55000,
    PORT_TO: 60000,
    HOST: '127.0.0.1',
    PROTOCOL: 'http:',
    SQUID_CMD: 'squid',
};

const tmpDirPromised = Promise.promisify(tmp.dir);
const fsWriteFilePromised = Promise.promisify(fs.writeFile);

/**
 * The class is used to manage a local Squid proxy process instance
 * that forwards HTTP requests to user-provided parent proxies.
 * The point of this is that there's no easy way to programmatically pass proxy
 * authentication credentials to web browsers such as Chrome, so we need to setup
 * local open proxy that can forward to parent proxy with authentication.
 */
export class ProxyChainManager {
    constructor() {
        // Dictionary of all proxy chains, key is Squid proxy port, value is parsed
        // URL of the original parent proxy.
        this.portToParsedProxyUrl = {};

        // PID of the Squid proxy process
        this.squidPid = null;

        // Path to temporary directory with config files
        this.tmpDir = null;
    }

    /**
     * Sets up an open child proxy which forwards to a specified parent proxy.
     * @param parsedChildProxyUrl Parsed URL of the parent proxy.
     * @return Promise Promise resolving to the parsed URL of the child proxy.
     */
    addProxyChain(parsedProxyUrl) {
        let parsedChildProxyUrl;
        return ProxyChainManager._findFreePort()
            .then((port) => {
                this.portToParsedProxyUrl[port] = _.clone(parsedProxyUrl);
                parsedChildProxyUrl = parseUrl(`${PROXY_CHAIN.PROTOCOL}//${PROXY_CHAIN.HOST}:${port}`);
                return this._manageSquidProcess();
            })
            .then(() => {
                return parsedChildProxyUrl;
            });
    }

    /**
     * Removes a child proxy.
     * @param parsedChildProxyUrl The result of the earlier call to the addProxyChain() method.
     * @return Promise Returns a promise that resolves when the proxy chain is reconfigured.
     */
    removeProxyChain(parsedChildProxyUrl) {
        if (parsedChildProxyUrl.protocol === PROXY_CHAIN.PROTOCOL
            && parsedChildProxyUrl.host === PROXY_CHAIN.HOST
            && this.portToParsedProxyUrl[parsedChildProxyUrl.port]) {
            delete this.portToParsedProxyUrl[parsedChildProxyUrl.port];
            return this._manageSquidProcess();
        }
    }

    static _findFreePort() {
        return portastic.find({
            min: PROXY_CHAIN.PORT_FROM,
            max: PROXY_CHAIN.PORT_TO,
            retrieve: 1,
        })
        .then((ports) => {
            if (ports.length < 1) throw new Error(`ProxyChainManager: There are no more free ports in range from ${PROXY_CHAIN.PORT_FROM} to ${PROXY_CHAIN.PORT_TO}`); // eslint-disable-line max-len
            return ports[0];
        });
    }

    /**
     * Determines whether the Squid process is still running.
     * @return Boolean
     * @private
     */
    _isSquidRunning() {
        // Inspired by https://github.com/nisaacson/is-running/blob/master/index.js
        if (!this.squidPid) return false;
        try {
            return !!process.kill(this.squidPid, 0);
        } catch (e) {
            return e.code === 'EPERM';
        }
    }

    /**
     * Manages Squid proxy process, which means the function either starts it, updates its configuration or kills it,
     * depending on the state of the `portToParsedProxyUrl` field.
     * @private
     */
    _manageSquidProcess() {
        // TODO: we should ensure that this method only runs once a time,
        // to avoid conflicts in config settings, e.g. using async module's queue
        // TODO: automatically restart squid process if it crashed, maybe using forever package? or simply using setInterval()

        // First, make sure that squidPid refers to the running Squid process
        if (this.squidPid && !this._isSquidRunning()) {
            this.squidPid = null;
        }

        // If Squid is no longer needed but it is still running, kill it to save system resources
        if (_.isEmpty(this.portToParsedProxyUrl)) {
            if (this.squidPid) {
                process.kill(this.squidPid);
                this.squidPid = null;
            }
            return;
        }

        // If Squid is not running yet but should be, start it
        if (!this.squidPid) {
            return Promise.resolve()
                .then(() => {
                    // Create temporary directory, if not created yet
                    if (!this.tmpDir) {
                        return tmpDirPromised({ template: '/tmp/squid-XXXXXX' })
                            .then((tmpDir) => {
                                this.tmpDir = tmpDir;
                            });
                    }
                })
                .then(() => {
                    // Store configuration file to temp dir
                    return this._writeSquidConf();
                })
                .then((squidConfPath) => {
                    // Start Squid process
                    const args = [`-f ${squidConfPath}`, '-N'];
                    const options = { cwd: this.tmpDir };
                    const process = childProcess.spawn(PROXY_CHAIN.SQUID_CMD, args, options);

                    // Wait for Squid process to be running or fail
                    return new Promise((resolve, reject) => {
                        let isFinished = false;
                        const intervalId = setInterval(() => {
                            if (this._isSquidRunning()) {
                                clearInterval(intervalId);
                                isFinished = true;
                                resolve();
                            }
                        }, 50);

                        process.on('error', (err) => {
                            if (isFinished) {
                                console.log(`ProxyChainManager: Squid process failed: ${err}`);
                                return;
                            }

                            // Give a user-friendly message for this common error
                            if (err.code === 'ENOENT') err = new Error('ProxyChainManager: "squid" command not found in the PATH');

                            clearInterval(intervalId);
                            isFinished = true;
                            reject(err);
                        });
                    });
                });
        }

        // Squid is already running, reconfigure it
        return Promise.resolve()
            .then(() => {
                // Store configuration file to temp dir
                return this._writeSquidConf();
            })
            .then((squidConfPath) => {
                // Run Squid process to reconfigure the other running instance and wait for the finish
                const args = [`-f ${squidConfPath}`, '-k reconfigure'];
                const options = { cwd: this.tmpDir };
                const process = childProcess.spawn(PROXY_CHAIN.SQUID_CMD, args, options);

                // Wait for Squid reconfiguration process to exit or fail
                return new Promise((resolve, reject) => {
                    let isFinished = false;
                    process.on('exit', (code, signal) => {
                        if (!isFinished) {
                            isFinished = true;
                            if (code !== 0) {
                                return reject(new Error(`ProxyChainManager: Squid reconfiguration process failed (exit code: ${code}, signal: ${signal})`)); // eslint-disable-line max-len
                            }
                            resolve();
                        }
                    });
                    process.on('error', (err) => {
                        if (!isFinished) {
                            isFinished = true;
                            return reject(new Error(`ProxyChainManager: Squid reconfiguration process failed: ${err}`));
                        }
                    });
                });
            });
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

    /**
     * Generates Squid proxy configuration file and writes it to the temporary directory.
     * @return Promise Promise resolving to the path to the configuration file.
     * @private
     */
    _writeSquidConf() {
        if (!this.tmpDir) throw new Error('Temporary directory not created yet');

        const chainConfs = _.values(_.mapObject(this.portToParsedProxyUrl, (parsedProxyUrl, port) => {
            return ProxyChainManager._generateSquidConfForPort(parsedProxyUrl, port);
        }));

        // NOTE: set pid_filename to isolate our squid instance from others possibly running in the system
        const conf = `
http_access allow all
never_direct allow all
access_log none
cache_store_log none
cache_log /dev/null
logfile_rotate 0
pid_filename ${path.join(this.tmpDir, 'squid.pid')}

${chainConfs}
`;
        const filePath = path.join(this.tmpDir, 'squid.conf');

        console.log(`Squid config:\n${conf}`);
        return fsWriteFilePromised(filePath, conf)
            .then(() => {
                return filePath;
            });
    }
}
