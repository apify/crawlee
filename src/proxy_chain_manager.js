import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import tmp from 'tmp';
import portastic from 'portastic';
import Promise from 'bluebird';
import { parseUrl } from './utils';

/* globals process */

// Constants, exported to simplify unit-testing.
export const PROXY_CHAIN = {
    PORT_FROM: 55000,
    PORT_TO: 60000,
    HOST: '127.0.0.1',
    PROTOCOL: 'http:',
    SQUID_CMD: 'squid',
    SQUID_CHECK_ARGS: ['-v'],
    SQUID_BATCH_TIMEOUT: 10000,
    TMP_DIR_TEMPLATE: '/tmp/apify-squid-XXXXXX',
    CONF_FILE_NAME: 'squid.conf',
    PID_FILE_NAME: 'squid.pid',
    LOG_PREFIX: 'ProxyChainManager: ',
};

const tmpDirPromised = Promise.promisify(tmp.dir);
const fsWriteFilePromised = Promise.promisify(fs.writeFile);
const execFilePromised = Promise.promisify(childProcess.execFile, { multiArgs: true });

/**
 * The class is used to manage a local Squid proxy instance
 * that forwards HTTP requests to user-provided parent proxies.
 * The point of this is that there's no easy way to programmatically pass proxy
 * authentication credentials to web browsers such as Chrome, so we need to setup
 * a local open proxy that can forward to parent proxy with authentication.
 */
export class ProxyChainManager {
    constructor() {
        // Indicates whether _initialize() succeeded
        this.isInitialized = false;

        // Dictionary of all proxy chains, key is Squid proxy port, value is an object such as:
        // { parsed
        // URL of the original parent proxy.
        this.portToParsedProxyUrl = {};

        // PID of the Squid proxy process
        this.squidPid = null;

        // Path to temporary directory with config files
        this.tmpDir = null;
    }

    /**
     * Creates the temporary directory and checks the installed Squid, unless it has already been done.
     * @return Promise
     * @private
     */
    _initialize() {
        if (this.isInitialized) return Promise.resolve();

        // Create temporary directory, if not created yet
        return tmpDirPromised({ template: PROXY_CHAIN.TMP_DIR_TEMPLATE })
            .then((tmpDir) => {
                this.tmpDir = tmpDir;

                // Run Squid process to get its version and wait for the finish
                const options = {
                    cwd: this.tmpDir,
                    timeout: PROXY_CHAIN.SQUID_BATCH_TIMEOUT,
                };
                console.log(`${PROXY_CHAIN.LOG_PREFIX}Checking Squid installation with '${PROXY_CHAIN.SQUID_CMD} ${PROXY_CHAIN.SQUID_CHECK_ARGS.join(' ')}'`); // eslint-disable-line max-len
                return execFilePromised(PROXY_CHAIN.SQUID_CMD, PROXY_CHAIN.SQUID_CHECK_ARGS, options)
                    .then((array) => {
                        const stdout = array[0];
                        // TODO: check that the version is at least 3.3 and throw error otherwise!
                        console.log(`${PROXY_CHAIN.LOG_PREFIX}${(stdout || '').split('\n')[0]}`);
                        this.isInitialized = true;
                    })
                    .catch((err) => {
                        // Give a user-friendly message for this common error
                        if (err.code === 'ENOENT') {
                            err = new Error(`'${PROXY_CHAIN.SQUID_CMD}' command not found in the PATH`);
                        }
                        throw err;
                    });
            });
    }

    /**
     * Sets up an open child proxy which forwards to a specified parent proxy.
     * @param parsedChildProxyUrl Parsed URL of the parent proxy.
     * @return Promise Promise resolving to the parsed URL of the child proxy.
     */
    addProxyChain(parsedProxyUrl) {
        if (!parsedProxyUrl.hostname || !parsedProxyUrl.port) throw new Error('Proxy URL must contain both hostname and port');
        if (parsedProxyUrl.scheme !== 'http') throw new Error('Only "http" proxy protocol is currently supported');

        let parsedChildProxyUrl;
        return ProxyChainManager._findFreePort()
            .then((port) => {
                this.portToParsedProxyUrl[port] = _.clone(parsedProxyUrl);
                const parentProxyUrl = `${parsedProxyUrl.protocol}//${parsedProxyUrl.username || ''}:${parsedProxyUrl.password ? '<redacted>' : ''}@${parsedProxyUrl.host}`; // eslint-disable-line max-len
                const childProxyUrl = `${PROXY_CHAIN.PROTOCOL}//${PROXY_CHAIN.HOST}:${port}`;
                parsedChildProxyUrl = parseUrl(childProxyUrl);

                console.log(`${PROXY_CHAIN.LOG_PREFIX}Adding proxy chain ${childProxyUrl} => ${parentProxyUrl}`);
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
            const childProxyUrl = `${PROXY_CHAIN.PROTOCOL}//${PROXY_CHAIN.HOST}:${parsedChildProxyUrl.port}`;
            console.log(`${PROXY_CHAIN.LOG_PREFIX}Removing proxy chain ${childProxyUrl}`);

            delete this.portToParsedProxyUrl[parsedChildProxyUrl.port];
            return this._manageSquidProcess()
                .then(() => true);
        }
        return Promise.resolve(false);
    }

    static _findFreePort() {
        return portastic.find({
            min: PROXY_CHAIN.PORT_FROM,
            max: PROXY_CHAIN.PORT_TO,
            retrieve: 1,
        })
        .then((ports) => {
            if (ports.length < 1) throw new Error(`There are no more free ports in range from ${PROXY_CHAIN.PORT_FROM} to ${PROXY_CHAIN.PORT_TO}`); // eslint-disable-line max-len
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
                console.log(`${PROXY_CHAIN.LOG_PREFIX}Killing Squid process ${this.squidPid}`);
                process.kill(this.squidPid, 'SIGKILL');
            }
            return;
        }

        // If Squid is not running yet but should be, start it
        if (!this.squidPid) {
            return this._initialize()
                .then(() => {
                    // Store configuration file to temp dir
                    return this._writeSquidConf();
                })
                .then((squidConfPath) => {
                    // Start Squid process
                    const cmd = PROXY_CHAIN.SQUID_CMD;
                    const args = ['-f', squidConfPath, '-N'];
                    const options = { cwd: this.tmpDir };
                    console.log(`${PROXY_CHAIN.LOG_PREFIX}Starting local Squid proxy using: ${cmd} ${args.join(' ')}`);
                    const proc = childProcess.spawn(PROXY_CHAIN.SQUID_CMD, args, options);

                    this.squidPid = proc.pid;

                    // Wait for Squid process to be running or fail
                    return new Promise((resolve, reject) => {
                        let isFinished = false;
                        const intervalId = setInterval(() => {
                            if (this._isSquidRunning()) {
                                clearInterval(intervalId);
                                isFinished = true;
                                resolve();
                            }
                            // console.log("NOT RUNNING");
                        }, 50);

                        proc.on('exit', (code, signal) => {
                            if (isFinished) {
                                console.log(`${PROXY_CHAIN.LOG_PREFIX}Squid process ${this.squidPid} exited (code: ${code}, signal: ${signal})`);
                                return;
                            }

                            clearInterval(intervalId);
                            isFinished = true;
                            this.squidPid = null;
                            reject(new Error(`Squid process ${this.squidPid} exited unexpectedly (code: ${code}, signal: ${signal})`)); // eslint-disable-line max-len
                        });

                        proc.on('error', (err) => {
                            if (isFinished) {
                                console.log(`${PROXY_CHAIN.LOG_PREFIX}Squid process ${this.squidPid} failed: ${err}`);
                                return;
                            }

                            clearInterval(intervalId);
                            isFinished = true;
                            this.squidPid = null;
                            reject(err);
                        });

                        // Print stdout/stderr to simplify debugging
                        const printLog = (data) => {
                            console.log(`${PROXY_CHAIN.LOG_PREFIX}: Squid says: ${data}`);
                        };
                        proc.stdout.on('data', printLog);
                        proc.stderr.on('data', printLog);
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
                const args = ['-f', squidConfPath, '-k', 'reconfigure'];
                const options = {
                    cwd: this.tmpDir,
                    timeout: PROXY_CHAIN.SQUID_BATCH_TIMEOUT,
                };
                return execFilePromised(PROXY_CHAIN.SQUID_CMD, args, options)
                    .then((arr) => {
                        console.dir(arr);

                        // TODO
                        return new Promise((resolve) => {
                            setTimeout(resolve, 1000);
                        });
                    })
                    .catch((err) => {
                        // Use better error message
                        throw new Error(`Squid reconfiguration failed (${err})`);
                    });
            });
    }

    static _generateSquidConfForPort(parsedProxyUrl, squidPort) {
        const peerName = `peer${squidPort}`;
        const aclName = `acl${squidPort}`;
        const str = `http_port ${squidPort}\n`
            + `cache_peer ${parsedProxyUrl.hostname} parent ${parsedProxyUrl.port} 0 no-query login=${parsedProxyUrl.auth} connect-fail-limit=99999999 proxy-only name=${peerName}\n` // eslint-disable-line max-len
            // + `acl ${aclName} myportname ${squidPort}\n`
            + `acl ${aclName} myportname ${squidPort}\n`
            + `cache_peer_access ${peerName} allow ${aclName}\n`
            + `cache_peer_access ${peerName} deny all\n`;
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
        })).join('\n');

        // NOTE: set pid_filename to isolate our squid instance from others possibly running in the system
        const conf = `
# debug_options 44,9 28,9
http_access allow all
never_direct allow all
via off # this probably requires --enable-http-violations compile option 
forwarded_for transparent
#access_log none
access_log daemon:${path.join(this.tmpDir, 'access.log')} squid
cache_store_log none
#cache_log /dev/null
cache_log ${path.join(this.tmpDir, 'cache.log')}
logfile_rotate 0
pid_filename ${path.join(this.tmpDir, PROXY_CHAIN.PID_FILE_NAME)}

${chainConfs}
`;
        const filePath = path.join(this.tmpDir, PROXY_CHAIN.CONF_FILE_NAME);

        console.log('CONFIG');
        console.log(conf);

        return fsWriteFilePromised(filePath, conf)
            .then(() => {
                return filePath;
            });
    }

    /**
     * Removes all proxy chains and terminates the squid process.
     * @return {*}
     */
    shutdown() {
        this.portToParsedProxyUrl = {};

        return this._manageSquidProcess();
    }
}
