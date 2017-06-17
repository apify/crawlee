import childProcess from 'child_process';
import fs from 'fs';
import path from 'path';
import tmp from 'tmp';
import portastic from 'portastic';
import Promise from 'bluebird';
import rimraf from 'rimraf';
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
};

const tmpDirPromised = Promise.promisify(tmp.dir);
const fsWriteFilePromised = Promise.promisify(fs.writeFile);
// const execFilePromised = Promise.promisify(childProcess.execFile, { multiArgs: true });


/*
 * Run Squid process to get its version and wait for the finish
 * @return Promise
const printSquidVersion = () => {
    // TODO: check that the version is at least 3.3 and throw error otherwise!
    console.log(`${PROXY_CHAIN.LOG_PREFIX}Checking Squid installation with '${PROXY_CHAIN.SQUID_CMD}
     ${PROXY_CHAIN.SQUID_CHECK_ARGS.join(' ')}'`); // eslint-disable-line max-len
    const options = {
        timeout: PROXY_CHAIN.SQUID_BATCH_TIMEOUT,
    };
    return execFilePromised(PROXY_CHAIN.SQUID_CMD, PROXY_CHAIN.SQUID_CHECK_ARGS, options)
        .then((array) => {
            const stdout = array[0];
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
};
*/

/**
 * The class is used to manage a local Squid proxy instance
 * that forwards HTTP requests to a user-provided parent proxy.
 * The point of this is that there's no easy way to programmatically pass proxy
 * authentication credentials to web browsers such as Chrome, so we need to setup
 * a local open proxy that can forward to parent proxy with authentication.
 */
export class ProxyChain {
    /**
     * Creates a new instance of ProxyChain class.
     * @param parsedProxyUrl Proxy URL parsed by calling parseUrl()
     */
    constructor(parsedProxyUrl) {
        if (!parsedProxyUrl.hostname || !parsedProxyUrl.port) throw new Error('Proxy URL must contain both hostname and port');
        if (parsedProxyUrl.scheme !== 'http') throw new Error('Only "http" proxy protocol is currently supported');

        this.parsedProxyUrl = parsedProxyUrl;

        // PID of the Squid proxy process
        this.squidPid = null;

        // TCP port where Squid is listening
        this.squidPort = null;

        // Path to temporary directory with config files
        this.tmpDir = null;
    }

    _getChildProxyUrl() {
        return `${PROXY_CHAIN.PROTOCOL}//${PROXY_CHAIN.HOST}:${this.squidPort}`;
    }

    _getParentProxyUrl() {
        const p = this.parsedProxyUrl;
        return `${p.protocol}//${p.username || ''}:${p.password ? '<redacted>' : ''}@${p.host}`;
    }

    /**
     * Creates the temporary directory, writes a config to it and starts Squid process.
     * @return Promise
     * @private
     */
    start() {
        // Create temporary directory, if not created yet
        return tmpDirPromised({ template: PROXY_CHAIN.TMP_DIR_TEMPLATE })
            .then((tmpDir) => {
                this.tmpDir = tmpDir;

                return ProxyChain._findFreePort();
            })
            .then((port) => {
                this.squidPort = port;

                // Write config file
                return this._writeSquidConf();
            })
            .then((squidConfPath) => {
                // Start Squid process
                const cmd = PROXY_CHAIN.SQUID_CMD;
                const args = ['-f', squidConfPath, '-N'];
                const options = { cwd: this.tmpDir };
                console.log(`Starting proxy chain: ${cmd} ${args.join(' ')}`);
                const proc = childProcess.spawn(cmd, args, options);

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
                            console.log(`Squid process ${this.squidPid} exited (code: ${code}, signal: ${signal})`);
                            return;
                        }

                        clearInterval(intervalId);
                        isFinished = true;
                        const msg = `Squid process ${this.squidPid} exited unexpectedly (code: ${code}, signal: ${signal})`;
                        reject(new Error(msg));
                    });

                    proc.on('error', (err) => {
                        if (isFinished) {
                            console.log(`Squid process ${this.squidPid} failed: ${err}`);
                            return;
                        }

                        // Give a user-friendly message for this common error
                        if (err.code === 'ENOENT') {
                            err = new Error(`'${PROXY_CHAIN.SQUID_CMD}' command not found in the PATH`);
                        }

                        clearInterval(intervalId);
                        isFinished = true;
                        reject(err);
                    });

                    // Print stdout/stderr to simplify debugging
                    const printLog = (data) => {
                        console.log(`Squid process ${this.squidPid} says: ${data}`);
                    };
                    proc.stdout.on('data', printLog);
                    proc.stderr.on('data', printLog);
                });
            })
            .then(() => {
                const childProxyUrl = this._getChildProxyUrl();
                console.log(`Started proxy chain ${childProxyUrl} => ${this._getParentProxyUrl()} (Squid pid: ${this.squidPid}, temp dir: ${this.tmpDir})`); // eslint-disable-line max-len

                return parseUrl(childProxyUrl);
            });
    }

    static _findFreePort() {
        // TODO: pick random port to minimize collision chance
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
     * Generates Squid proxy configuration file and writes it to the temporary directory.
     * @return Promise Promise resolving to the path to the configuration file.
     * @private
     */
    _writeSquidConf() {
        if (!this.tmpDir) throw new Error('Temporary directory not created yet');

        const proxy = this.parsedProxyUrl;

        // NOTE: need to set pid_filename to isolate our squid instance from others possibly running in the system
        const conf = `
visible_hostname apify-actor
# debug_options 44,9 28,9
http_access allow all
never_direct allow all
# this probably requires --enable-http-violations compile option
via off 
forwarded_for transparent
access_log none
#access_log daemon:${path.join(this.tmpDir, 'access.log')} squid
cache_store_log none
cache_log /dev/null
#cache_log ${path.join(this.tmpDir, 'cache.log')}
logfile_rotate 0
pid_filename ${path.join(this.tmpDir, PROXY_CHAIN.PID_FILE_NAME)}

http_port ${this.squidPort}
cache_peer ${proxy.hostname} parent ${proxy.port} 0 no-query login=${proxy.auth} connect-fail-limit=99999999 proxy-only name=my_peer
cache_peer_access my_peer allow all
`;
        const filePath = path.join(this.tmpDir, PROXY_CHAIN.CONF_FILE_NAME);

        // console.log('CONFIG');
        // console.log(conf);

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
        console.log(`Shutting down proxy chain ${this._getChildProxyUrl()} => ${this._getParentProxyUrl()} (Squid pid: ${this.squidPid})`); // eslint-disable-line max-len

        if (this._isSquidRunning()) {
            try {
                process.kill(this.squidPid, 'SIGKILL');
            } catch (err) {
                console.log(`WARNING: Failed to kill Squid process ${this.squidPid}: ${err}`);
            }
        }

        if (this.tmpDir) {
            const tmpDir = this.tmpDir;
            rimraf(tmpDir, { glob: false }, (err) => {
                if (err) {
                    console.log(`WARNING: Failed to delete temporary directory at ${tmpDir}: ${err}`);
                }
            });
            this.tmpDir = null;
        }
    }
}
