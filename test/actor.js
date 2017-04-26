import fs from 'fs';
import { expect } from 'chai';
import tmp from 'tmp';
import request from 'request';
import portastic from 'portastic';

// NOTE: use require() here because this is how its done in acts
const Apifier = process.env.TEST_BABEL_BUILD ? require('../build/index') : require('../src/index');

if (process.env.TEST_BABEL_BUILD) console.log('Running with TEST_BABEL_BUILD option');

/* global process */


const processExitOverride = (code) => {
    // TODO: the codes should be tested
    console.log(`Exit with code: ${code}`);
};

const origProcessExit = process.exit;

let freePorts = [];
before(() => {
    // intercept calls to process.exit()
    process.exit = processExitOverride;

    // find free ports for testing
    return portastic.find({
        min: 50000,
        max: 51000,
    })
    .then((ports) => {
        freePorts = ports;
    });
});

after(() => {
    // restore process.exit()
    process.exit = origProcessExit;
});

const getFreePort = () => freePorts.pop();


const createWatchFile = () => {
    const tmpobj = tmp.fileSync();
    const path = tmpobj.name;
    fs.writeSync(tmpobj.fd, 'bla bla bla bla');

    const stat = fs.statSync(path);
    expect(stat.size).to.be.greaterThan(0);
    return path;
};

const testWatchFileEmpty = (path) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const stat = fs.statSync(path);
            if (stat.size !== 0) {
                reject('Watch file not written');
            } else {
                resolve();
            }
        }, 100);
    });
};


const testRequestToMain = (method, bodyRaw, contentType) => {
    const port = getFreePort();
    process.env.APIFIER_INTERNAL_PORT = port;

    return new Promise((resolve, reject) => {
        const req = {
            url: `http://127.0.0.1:${port}/`,
            method,
            body: bodyRaw,
            headers: {
                'Content-Type': contentType,
            },
            timeout: 1000,
        };

        let expectedBody = bodyRaw;
        if (contentType === 'application/json') expectedBody = JSON.parse(bodyRaw);

        request(req, (err) => {
            if (err) return reject(err);
        });

        Apifier.main((opts) => {
            // console.dir(opts);
            try {
                expect(opts.input.method).to.equal(method);
                expect(opts.input.contentType).to.equal(contentType);
                expect(opts.input.body).to.deep.equal(expectedBody);
            } catch (err) {
                reject(err);
            }
            resolve();
        });
    });
};


describe('Apifier.main()', () => {
    it('throws on invalid args', () => {
        process.env.APIFIER_INTERNAL_PORT = 1234;
        expect(() => {
            Apifier.main();
        }).to.throw(Error);
    });

    it('throws on invalid env vars', () => {
        const fn = () => {
            Apifier.main(() => {});
        };

        process.env.APIFIER_INTERNAL_PORT = null;
        expect(fn).to.throw(Error);

        process.env.APIFIER_INTERNAL_PORT = '';
        expect(fn).to.throw(Error);

        process.env.APIFIER_INTERNAL_PORT = 0;
        expect(fn).to.throw(Error);

        process.env.APIFIER_INTERNAL_PORT = 65536;
        expect(fn).to.throw(Error);
    });

    it('truncates watch file', () => {
        process.env.APIFIER_WATCH_FILE = createWatchFile();
        process.env.APIFIER_INTERNAL_PORT = getFreePort();
        Apifier.main(() => {});
        return testWatchFileEmpty(process.env.APIFIER_WATCH_FILE);
    });

    it('passes text/plain request', () => {
        return testRequestToMain('POST', 'testxxx', 'text/plain');
    });

    it('passes application/json request', () => {
        return testRequestToMain('PUT', JSON.stringify({ abc: 123 }), 'application/json');
    });

    it('passes raw request', () => {
        return testRequestToMain('PUT', new Buffer('somebinarydata'), 'image/png');
    });

    // TODO: test responses from act, exceptions etc. !
});


describe('Apifier.heyIAmReady()', () => {
    it('it works as expected', () => {
        process.env.APIFIER_WATCH_FILE = createWatchFile();
        Apifier.heyIAmReady();
        return testWatchFileEmpty(process.env.APIFIER_WATCH_FILE);
    });
});
