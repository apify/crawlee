import fs from 'fs';
import { expect } from 'chai';
import tmp from 'tmp';
import request from 'request';
import portastic from 'portastic';

// TODO: override console.log() to test the error messages (now they are printed to console)

// NOTE: use require() here because this is how its done in acts
const Apifier = process.env.TEST_BABEL_BUILD ? require('../build/index') : require('../src/index');

if (process.env.TEST_BABEL_BUILD) console.log('Running with TEST_BABEL_BUILD option');

/* global process */

let freePorts = [];
before(() => {
    // find free ports for testing
    return portastic.find({
        min: 50000,
        max: 51000,
    })
    .then((ports) => {
        freePorts = ports;
    });
});

// always restore original process.exit()
const origProcessExit = process.exit;
after(() => {
    process.exit = origProcessExit;
});

const popFreePort = () => freePorts.pop();


const createWatchFile = () => {
    const tmpobj = tmp.fileSync();
    const path = tmpobj.name;
    fs.writeSync(tmpobj.fd, 'bla bla bla bla');

    const stat = fs.statSync(path);
    expect(stat.size).to.be.greaterThan(0);
    return path;
};

const testWatchFileWillBecomeEmpty = (path, waitMillis) => {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
        const intervalId = setInterval(() => {
            const stat = fs.statSync(path);
            if (stat.size !== 0) {
                if (Date.now() - startedAt >= waitMillis) reject(`Watch file not written in ${waitMillis} millis`);
            } else {
                clearInterval(intervalId);
                resolve();
            }
        }, 20);
    });
};


const testMain = (method, bodyRaw, contentType, userFunc, expectedExitCode = 0) => {
    const port = popFreePort();
    process.env.APIFY_INTERNAL_PORT = port;
    process.env.APIFY_WATCH_FILE = createWatchFile();

    // intercept calls to process.exit()
    const EMPTY_EXIT_CODE = 'dummy';
    let exitCode = EMPTY_EXIT_CODE;
    process.exit = (code) => {
        exitCode = code;
    };

    return new Promise((resolve, reject) => {
        let expectedBody = bodyRaw;
        if (contentType === 'application/json') expectedBody = JSON.parse(bodyRaw);

        // give server a little time to start listening before sending the request
        setTimeout(() => {
            const req = {
                url: `http://127.0.0.1:${port}/`,
                method,
                body: bodyRaw,
                headers: {},
                timeout: 1000,
            };
            if (contentType) req.headers['Content-Type'] = contentType;

            request(req, (err) => {
                if (err) return reject(err);
            });
        }, 20);

        Apifier.main((opts) => {
            // console.dir(opts);
            try {
                expect(opts.input.method).to.equal(method);
                if (contentType) expect(opts.input.contentType).to.equal(contentType);
                expect(opts.input.body).to.deep.equal(expectedBody);
                resolve();
            } catch (err) {
                reject(err);
            }
            // call user func to test other behavior
            if (userFunc) userFunc(opts);
        });
    })
    .then(() => {
        // watch file should be empty by now
        return testWatchFileWillBecomeEmpty(process.env.APIFY_WATCH_FILE, 0);
    })
    .then(() => {
        // test process exit code is as expected
        return new Promise((resolve, reject) => {
            const intervalId = setInterval(() => {
                if (exitCode === EMPTY_EXIT_CODE) return;
                clearInterval(intervalId);
                // restore process.exit()
                process.exit = origProcessExit;
                try {
                    expect(exitCode).to.equal(expectedExitCode);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            }, 20);
        });
    });
};


describe('Apifier.main()', () => {
    it('throws on invalid args', () => {
        process.env.APIFY_INTERNAL_PORT = 1234;
        expect(() => {
            Apifier.main();
        }).to.throw(Error);
    });

    it('throws on invalid env vars', () => {
        const fn = () => {
            Apifier.main(() => {});
        };

        process.env.APIFY_INTERNAL_PORT = null;
        expect(fn).to.throw(Error);

        process.env.APIFY_INTERNAL_PORT = '';
        expect(fn).to.throw(Error);

        process.env.APIFY_INTERNAL_PORT = 0;
        expect(fn).to.throw(Error);

        process.env.APIFY_INTERNAL_PORT = 65536;
        expect(fn).to.throw(Error);
    });

    it('passes text/plain POST request', () => {
        return testMain('POST', 'testxxx', 'text/plain');
    });

    it('passes application/json PUT request', () => {
        return testMain('PUT', JSON.stringify({ abc: 123 }), 'application/json');
    });

    it('passes raw POST request', () => {
        return testMain('POST', new Buffer('somebinarydata'), 'image/png');
    });

    it('passes empty GET request with application/json content type', () => {
        return testMain('GET', null, 'application/json');
    });

    it('passes empty GET request with no content type', () => {
        return testMain('GET', null, null);
    });

    it('on exception exits process with code 1', () => {
        const userFunc = () => {
            throw new Error('Test exception');
        };
        return testMain('PUT', 'testxxx', 'text/plain', userFunc, 1);
    });

    // TODO: test responses from act, exceptions etc. !
});


describe('Apifier.heyIAmReady()', () => {
    it('it works as expected', () => {
        process.env.APIFY_WATCH_FILE = createWatchFile();
        Apifier.heyIAmReady();
        return testWatchFileWillBecomeEmpty(process.env.APIFY_WATCH_FILE, 1000);
    });
});
