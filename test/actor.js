import fs from 'fs';
import pathModule from 'path';
import _ from 'underscore';
import { expect, assert } from 'chai';
import sinon from 'sinon';
import tmp from 'tmp';
import rimraf from 'rimraf';
import Promise from 'bluebird';
import { ACT_TASK_STATUSES } from '../build/constants';

// NOTE: test use of require() here because this is how its done in acts
const Apify = require('../build/index');

/* global process, describe, it */

// TODO: override console.log() to test the error messages (now they are printed to console)
// TODO: test callback version of functions!!!

/*
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
const popFreePort = () => freePorts.pop();
*/

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

/*
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

        Apify.main((opts) => {
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
*/

/**
 * Helper function that enables testing of Apify.main()
 * @return Promise
 */
const testMain = ({ userFunc, exitCode }) => {
    // Mock process.exit() to check exit code and prevent process exit
    const processMock = sinon.mock(process);
    const exitExpectation = processMock
        .expects('exit')
        .withExactArgs(exitCode)
        .once()
        .returns();

    let error = null;

    return Promise.resolve()
        .then(() => {
            return new Promise((resolve, reject) => {
                // Invoke main() function, the promise resolves after the user function is run
                Apify.main(() => {
                    try {
                        // Wait for all tasks in Node.js event loop to finish
                        resolve();
                    } catch (err) {
                        reject(err);
                        return;
                    }
                    // Call user func to test other behavior (note that it can throw)
                    if (userFunc) return userFunc();
                });
            })
            .catch((err) => {
                error = err;
            });
        })
        .then(() => {
            // Waits max 1000 millis for process.exit() mock to be called
            // console.log(`XXX: grand finale: ${err}`);
            return new Promise((resolve) => {
                const waitUntil = Date.now() + 1000;
                const intervalId = setInterval(() => {
                    // console.log('test for exitExpectation.called');
                    if (!exitExpectation.called && Date.now() < waitUntil) return;
                    clearInterval(intervalId);
                    // console.log(`exitExpectation.called: ${exitExpectation.called}`);
                    resolve();
                }, 10);
            });
        })
        .then(() => {
            if (error) throw error;
            processMock.verify();
        })
        .finally(() => {
            processMock.restore();
        });
};


const getEmptyEnv = () => {
    return {
        internalPort: null,
        actId: null,
        actRunId: null,
        userId: null,
        token: null,
        startedAt: null,
        timeoutAt: null,
        defaultKeyValueStoreId: null,
    };
};

const setEnv = (env) => {
    delete process.env.APIFY_INTERNAL_PORT;
    delete process.env.APIFY_ACT_ID;
    delete process.env.APIFY_ACT_RUN_ID;
    delete process.env.APIFY_USER_ID;
    delete process.env.APIFY_TOKEN;
    delete process.env.APIFY_STARTED_AT;
    delete process.env.APIFY_TIMEOUT_AT;
    delete process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;

    if (env.internalPort) process.env.APIFY_INTERNAL_PORT = env.internalPort.toString();
    if (env.actId) process.env.APIFY_ACT_ID = env.actId;
    if (env.actRunId) process.env.APIFY_ACT_RUN_ID = env.actRunId;
    if (env.userId) process.env.APIFY_USER_ID = env.userId;
    if (env.token) process.env.APIFY_TOKEN = env.token;
    if (env.startedAt) process.env.APIFY_STARTED_AT = env.startedAt.toISOString();
    if (env.timeoutAt) process.env.APIFY_TIMEOUT_AT = env.timeoutAt.toISOString();
    if (env.defaultKeyValueStoreId) process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = env.defaultKeyValueStoreId;
};

describe('Apify.getEnv()', () => {
    it('works with null values', () => {
        const expectedEnv = getEmptyEnv();
        setEnv(expectedEnv);

        const env = Apify.getEnv();
        expect(env).to.eql(expectedEnv);
    });

    it('works with with non-null values', () => {
        const expectedEnv = _.extend(getEmptyEnv(), {
            internalPort: 12345,
            actId: 'test actId',
            actRunId: 'test actId',
            userId: 'some user',
            token: 'auth token',
            startedAt: new Date('2017-01-01'),
            timeoutAt: new Date(),
            defaultKeyValueStoreId: 'some store',
        });
        setEnv(expectedEnv);

        const env = Apify.getEnv();
        expect(env).to.eql(expectedEnv);
    });
});


describe('Apify.main()', () => {
    it('throws on invalid args', () => {
        expect(() => {
            Apify.main();
        }).to.throw(Error);
    });

    it('works with simple user function', () => {
        return testMain({
            userFunc: () => {},
            env: {},
            exitCode: 0,
        });
    });

    it('works with promised user function', () => {
        let called = false;
        return testMain({
            userFunc: () => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        called = true;
                        // console.log('called = true');
                        resolve();
                    }, 20);
                });
            },
            env: {},
            exitCode: 0,
        })
        .then(() => {
            expect(called).to.eql(true);
        });
    });

    it('on exception in simple user function the process exits with code 91', () => {
        return testMain({
            userFunc: () => {
                throw new Error('Test exception I');
            },
            env: {},
            exitCode: 91,
        });
    });

    it('on exception in promised user function the process exits with code 91', () => {
        return testMain({
            userFunc: () => {
                return new Promise((resolve) => {
                    setTimeout(resolve, 20);
                })
                .then(() => {
                    throw new Error('Text exception II');
                });
            },
            env: {},
            exitCode: 91,
        });
    });
});


describe('Apify.getValue()', () => {
    it('throws on invalid args', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const keyErrMsg = 'The "key" parameter must be a non-empty string';
        expect(() => { Apify.getValue(); }).to.throw(Error, keyErrMsg);
        expect(() => { Apify.getValue({}); }).to.throw(Error, keyErrMsg);
        expect(() => { Apify.getValue(''); }).to.throw(Error, keyErrMsg);
        expect(() => { Apify.getValue(null); }).to.throw(Error, keyErrMsg);
    });

    it('throws if APIFY_DEFAULT_KEY_VALUE_STORE_ID env var is not defined', () => {
        const errMsg = 'The \'APIFY_DEFAULT_KEY_VALUE_STORE_ID\' environment variable is not defined';

        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '';
        expect(() => { Apify.getValue('KEY'); }).to.throw(Error, errMsg);

        delete process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;
        expect(() => { Apify.getValue('some other key'); }).to.throw(Error, errMsg);
    });

    it('supports both promises and callbacks (on success)', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('getRecord')
            .twice()
            .returns(Promise.resolve(null));

        return Promise.resolve()
            .then(() => {
                // test promise
                return Apify.getValue('INPUT');
            })
            .then((input) => {
                expect(input).to.be.eql(null);
            })
            .then(() => {
                // test callback
                return new Promise((resolve, reject) => {
                    Apify.getValue('INPUT', (err, input) => {
                        if (err) return reject(err);
                        resolve(input);
                    });
                });
            })
            .then((input) => {
                expect(input).to.be.eql(null);

                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('supports both promises and callbacks (on error)', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('getRecord')
            .twice()
            .throws(new Error('Test error'));

        return Promise.resolve()
            .then(() => {
                // test promise
                return Apify.getValue('INPUT')
                    .then(() => {
                        assert.fail();
                    })
                    .catch((err) => {
                        expect(err.message).to.be.eql('Test error');
                    });
            })
            .then(() => {
                // test callback
                return new Promise((resolve, reject) => {
                    Apify.getValue('INPUT', (err, input) => {
                        if (err) return reject(err);
                        resolve(input);
                    });
                })
                .then(() => {
                    assert.fail();
                })
                .catch((err) => {
                    expect(err.message).to.be.eql('Test error');
                });
            })
            .then(() => {
                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('works with APIFY_DEV_KEY_VALUE_STORE_DIR env var (on success)', () => {
        const jsonValue = { test: 123 };
        const textValue = 'some text \u00e6\u00f8\u00e5';
        const rawValue = Buffer.from('bla bla bla');
        const tmpobj = tmp.dirSync();
        process.env.APIFY_DEV_KEY_VALUE_STORE_DIR = tmpobj.name;

        // Test that this env var doesn't need to be set
        delete process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;

        return Promise.resolve()
            .then(() => {
                // Test JSON with default content type
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE;
                fs.writeFileSync(pathModule.join(tmpobj.name, 'INPUT'), JSON.stringify(jsonValue));
                return Apify.getValue('INPUT');
            })
            .then((value) => {
                expect(value).to.be.eql(jsonValue);
            })
            .then(() => {
                // Test text
                fs.writeFileSync(pathModule.join(tmpobj.name, 'TEST_TEXT'), textValue);
                process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE = 'text/plain';
                return Apify.getValue('TEST_TEXT');
            })
            .then((value) => {
                expect(value).to.be.eql(textValue);
            })
            .then(() => {
                // Test that this env var can be set to anything
                process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = 'whatever';

                // Test raw data
                fs.writeFileSync(pathModule.join(tmpobj.name, 'TEST_RAW'), rawValue);
                process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE = 'something/else';
                return Apify.getValue('TEST_RAW');
            })
            .then((value) => {
                expect(value).to.be.eql(rawValue);
            })
            .then(() => {
                // Test non-existent key but existing dir
                return Apify.getValue('NON_EXISTENT_KEY');
            })
            .then((value) => {
                expect(value).to.be.eql(null);
            })
            .then(() => {
                // Test callback with JSON plus explicit content type
                process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE = 'application/json; charset=utf-8';
                return new Promise((resolve, reject) => {
                    Apify.getValue('INPUT', (err, input) => {
                        if (err) return reject(err);
                        resolve(input);
                    });
                });
            })
            .then((value) => {
                expect(value).to.be.eql(jsonValue);
            })
            .finally(() => {
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_DIR;
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE;
                rimraf.sync(tmpobj.name);
            });
    });

    it('works with APIFY_DEV_KEY_VALUE_STORE_DIR env var (on error)', () => {
        const tmpobj = tmp.dirSync();
        process.env.APIFY_DEV_KEY_VALUE_STORE_DIR = tmpobj.name;

        return Promise.resolve()
            .then(() => {
                // Test invalid JSON
                fs.writeFileSync(pathModule.join(tmpobj.name, 'INPUT'), 'something not JSON');
                return Apify.getValue('INPUT')
                    .then(() => {
                        assert.fail();
                    })
                    .catch((err) => {
                        expect(err.message).to.contain('cannot be parsed as JSON');
                    });
            })
            .then(() => {
                // Test callback plus non-existent directory
                process.env.APIFY_DEV_KEY_VALUE_STORE_DIR = pathModule.join(tmpobj.name, '/blabla/');
                return new Promise((resolve, reject) => {
                    Apify.getValue('INPUT', (err, input) => {
                        if (err) return reject(err);
                        resolve(input);
                    });
                })
                .then(() => {
                    assert.fail();
                })
                .catch((err) => {
                    expect(err.message).to.contain('The directory does not exist');
                });
            })
            .then(() => {
                // Test file instead of dir
                const path = pathModule.join(tmpobj.name, '/subfile');
                fs.writeFileSync(path, 'some sub file in dir');
                process.env.APIFY_DEV_KEY_VALUE_STORE_DIR = path;
                return Apify.getValue('INPUT')
                    .then(() => {
                        assert.fail();
                    })
                    .catch((err) => {
                        expect(err.message).to.contain('The directory is not a directory');
                    });
            })
            .finally(() => {
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_DIR;
            });
    });
});

describe('Apify.setValue()', () => {
    it('throws on invalid args', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const keyErrMsg = 'The "key" parameter must be a non-empty string';
        expect(() => { Apify.setValue(); }).to.throw(Error, keyErrMsg);
        expect(() => { Apify.setValue('', null); }).to.throw(Error, keyErrMsg);
        expect(() => { Apify.setValue('', 'some value'); }).to.throw(Error, keyErrMsg);
        expect(() => { Apify.setValue({}, 'some value'); }).to.throw(Error, keyErrMsg);
        expect(() => { Apify.setValue(123, 'some value'); }).to.throw(Error, keyErrMsg);

        const valueErrMsg = 'The "value" parameter must be a String or Buffer when "contentType" is specified';
        expect(() => { Apify.setValue('key', {}, { contentType: 'image/png' }); }).to.throw(Error, valueErrMsg);
        expect(() => { Apify.setValue('key', 12345, { contentType: 'image/png' }); }).to.throw(Error, valueErrMsg);
        expect(() => { Apify.setValue('key', () => {}, { contentType: 'image/png' }); }).to.throw(Error, valueErrMsg);

        const optsErrMsg = 'The "options" parameter must be an object, null or undefined';
        expect(() => { Apify.setValue('key', {}, 123); }).to.throw(Error, optsErrMsg);
        expect(() => { Apify.setValue('key', {}, 'bla/bla'); }).to.throw(Error, optsErrMsg);
        expect(() => { Apify.setValue('key', {}, true); }).to.throw(Error, optsErrMsg);

        const circularObj = {};
        circularObj.xxx = circularObj;
        const jsonErrMsg = 'The "value" parameter cannot be stringified to JSON';
        expect(() => { Apify.setValue('key', circularObj, null); }).to.throw(Error, jsonErrMsg);
        expect(() => { Apify.setValue('key', undefined); }).to.throw(Error, jsonErrMsg);
        expect(() => { Apify.setValue('key', () => {}); }).to.throw(Error, jsonErrMsg);
        expect(() => { Apify.setValue('key'); }).to.throw(Error, jsonErrMsg);

        const contTypeRedundantErrMsg = 'The "options.contentType" parameter must not be used when removing the record';
        expect(() => { Apify.setValue('key', null, { contentType: 'image/png' }); }).to.throw(Error, contTypeRedundantErrMsg);
        expect(() => { Apify.setValue('key', null, { contentType: '' }); }).to.throw(Error, contTypeRedundantErrMsg);
        expect(() => { Apify.setValue('key', null, { contentType: {} }); }).to.throw(Error, contTypeRedundantErrMsg);

        const contTypeStringErrMsg = 'The "options.contentType" parameter must be a non-empty string, null or undefined';
        expect(() => { Apify.setValue('key', 'value', { contentType: 123 }); }).to.throw(Error, contTypeStringErrMsg);
        expect(() => { Apify.setValue('key', 'value', { contentType: {} }); }).to.throw(Error, contTypeStringErrMsg);
        expect(() => { Apify.setValue('key', 'value', { contentType: new Date() }); }).to.throw(Error, contTypeStringErrMsg);
        expect(() => { Apify.setValue('key', 'value', { contentType: '' }); }).to.throw(Error, contTypeStringErrMsg);
    });

    it('throws if APIFY_DEFAULT_KEY_VALUE_STORE_ID env var is not defined', () => {
        const errMsg = 'The \'APIFY_DEFAULT_KEY_VALUE_STORE_ID\' environment variable is not defined';

        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '';
        expect(() => { Apify.setValue('KEY', { something: 123 }); }).to.throw(Error, errMsg);

        delete process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;
        expect(() => { Apify.setValue('KEY', { something: 123 }); }).to.throw(Error, errMsg);
    });

    it('supports both promises and callbacks (on success)', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('putRecord')
            .exactly(8)
            .returns(Promise.resolve(null));

        return Promise.resolve()
            .then(() => {
                // test promise (no options)
                return Apify.setValue('mykey', { someValue: 123 });
            })
            .then(() => {
                // test promise (with options)
                return Apify.setValue('mykey', 'value', { contentType: 'text/plain' });
            })
            .then(() => {
                // test promise (null options)
                return Apify.setValue('mykey', 'value', null);
            })
            .then(() => {
                // test promise (undefined options)
                return Apify.setValue('mykey', 'value', undefined);
            })
            .then(() => {
                // test callback (no options)
                return new Promise((resolve, reject) => {
                    Apify.setValue('mykey', { someValue: 123 }, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            })
            .then(() => {
                // test callback (with options)
                return new Promise((resolve, reject) => {
                    Apify.setValue('mykey', 'myvalue', { contentType: 'text/plain' }, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            })
            .then(() => {
                // test callback (null options)
                return new Promise((resolve, reject) => {
                    Apify.setValue('mykey', { someValue: 123 }, null, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            })
            .then(() => {
                // test callback (undefined options)
                return new Promise((resolve, reject) => {
                    Apify.setValue('mykey', { someValue: 123 }, resolve, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            })
            .then(() => {
                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('supports both promises and callbacks (on error)', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('putRecord')
            .twice()
            .throws(new Error('Test error'));

        return Promise.resolve()
            .then(() => {
                // Test promise
                return Promise.resolve()
                    .then(() => {
                        return Apify.setValue('mykey', { someValue: 1 });
                    })
                    .then(() => {
                        assert.fail();
                    })
                    .catch((err) => {
                        expect(err.message).to.be.eql('Test error');
                    });
            })
            .then(() => {
                // Test callback
                return new Promise((resolve, reject) => {
                    Apify.setValue('mykey', { someValue: 1 }, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                })
                .then(() => {
                    assert.fail();
                })
                .catch((err) => {
                    expect(err.message).to.be.eql('Test error');
                });
            })
            .then(() => {
                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('correctly stores object values as JSON', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const storeId = 'mystore';
        const key = 'mykey';
        const value = { someValue: 123 };

        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = storeId;

        Apify.setPromisesDependency(Promise);

        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('putRecord')
            .once()
            .withArgs({
                storeId,
                promise: Promise,
                key,
                body: JSON.stringify(value, null, 2),
                contentType: 'application/json; charset=utf-8',
            })
            .returns(Promise.resolve(null));

        return Promise.resolve()
            .then(() => {
                return Apify.setValue(key, value);
            })
            .then(() => {
                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('correctly adds charset to content type', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const storeId = 'mystore3';
        const key = 'mykey2';
        const value = 'some string value';

        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = storeId;

        Apify.setPromisesDependency(Promise);

        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('putRecord')
            .once()
            .withArgs({
                storeId,
                promise: Promise,
                key,
                body: value,
                contentType: 'text/plain; charset=utf-8; foo=bar',
            })
            .returns(Promise.resolve(null));

        return Promise.resolve()
            .then(() => {
                return Apify.setValue(key, value, { contentType: 'text/plain; foo=bar' });
            })
            .then(() => {
                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('correctly stores raw string values', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const storeId = 'mystore3';
        const key = 'mykey2';
        const value = 'some string value';
        const contentType = 'text/plain; charset=utf-8';

        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = storeId;

        Apify.setPromisesDependency(Promise);

        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('putRecord')
            .once()
            .withArgs({
                storeId,
                promise: Promise,
                key,
                body: value,
                contentType,
            })
            .returns(Promise.resolve(null));

        return Promise.resolve()
            .then(() => {
                return Apify.setValue(key, value, { contentType });
            })
            .then(() => {
                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('correctly stores raw Buffer values', () => {
        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = '1234';
        const storeId = 'mystore3';
        const key = 'mykey2';
        const value = Buffer.from('some text value');
        const contentType = 'text/plain; charset=something';

        process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = storeId;

        Apify.setPromisesDependency(Promise);

        const mock = sinon.mock(Apify.client.keyValueStores);
        mock.expects('putRecord')
            .once()
            .withArgs({
                storeId,
                promise: Promise,
                key,
                body: value,
                contentType,
            })
            .returns(Promise.resolve(null));

        return Promise.resolve()
            .then(() => {
                return Apify.setValue(key, value, { contentType });
            })
            .then(() => {
                mock.verify();
            })
            .finally(() => {
                mock.restore();
            });
    });

    it('works with APIFY_DEV_KEY_VALUE_STORE_DIR env var (on success)', () => {
        const tmpobj = tmp.dirSync();
        const testObj = { 'bla-bla': 123 };
        const valueString = 'bla bla some string';
        const valueRaw = Buffer.from('some other string that will be raw as ham');
        process.env.APIFY_DEV_KEY_VALUE_STORE_DIR = tmpobj.name;

        // Test that this env var doesn't need to be set
        delete process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;

        return Promise.resolve()
            .then(() => {
                // Test write object
                Apify.setValue('TEST_OBJ', testObj);
            })
            .then(() => {
                return Apify.getValue('TEST_OBJ');
            })
            .then((value) => {
                expect(value).to.be.eql(testObj);
            })
            .then(() => {
                // Test removal of value
                Apify.setValue('TEST_OBJ', null);
            })
            .then(() => {
                // File must no longer exists
                const filePath = pathModule.join(tmpobj.name, '/TEST_OBJ');
                const exists = fs.existsSync(filePath);
                expect(exists).to.be.eql(false);
            })
            .then(() => {
                // Test that this env var can be set to anything
                process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = 'whatever';

                // Test write of string with callbacks
                return new Promise((resolve, reject) => {
                    Apify.setValue('TEST_STR', valueString, { contentType: 'text/plain' }, (err, input) => {
                        if (err) return reject(err);
                        resolve(input);
                    });
                });
            })
            .then(() => {
                process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE = 'text/plain';
                return Apify.getValue('TEST_STR');
            })
            .then((value) => {
                expect(value).to.be.eql(valueString);
            })
            .then(() => {
                // Test write raw buffer
                Apify.setValue('TEST_RAW', valueRaw, { contentType: 'something/whatever' });
            })
            .then(() => {
                process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE = 'something/raw';
                return Apify.getValue('TEST_RAW');
            })
            .then((value) => {
                expect(value).to.be.eql(valueRaw);
            })
            .finally(() => {
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_DIR;
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE;
                // rimraf.sync(tmpobj.name);
            });
    });

    it('works with APIFY_DEV_KEY_VALUE_STORE_DIR env var (on error)', () => {
        const tmpobj = tmp.dirSync();
        process.env.APIFY_DEV_KEY_VALUE_STORE_DIR = pathModule.join(tmpobj.name, '/non-existent-dir/');

        return Promise.resolve()
            .then(() => {
                // Test write object with Promise
                Apify.setValue('TEST1', { whatever: 123 })
                    .then(() => {
                        assert.fail();
                    })
                    .catch((err) => {
                        expect(err.message).to.contain('ENOENT');
                    });
            })
            .then(() => {
                // Test callback plus non-existent directory
                return new Promise((resolve, reject) => {
                    Apify.setValue('TEST2', { sometingElse: 456 }, (err, input) => {
                        if (err) return reject(err);
                        resolve(input);
                    });
                })
                .then(() => {
                    assert.fail();
                })
                .catch((err) => {
                    expect(err.message).to.contain('ENOENT');
                });
            })
            .finally(() => {
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_DIR;
                delete process.env.APIFY_DEV_KEY_VALUE_STORE_CONTENT_TYPE;
                // rimraf.sync(tmpobj.name);
            });
    });
});

describe('Apify.events', () => {
    it('is there and works as EventEmitter', () => {
        return new Promise((resolve, reject) => {
            try {
                Apify.events.on('foo', resolve);
                Apify.events.emit('foo', 'test event');
            } catch (e) {
                reject(e);
            }
        })
        .then((arg) => {
            expect(arg).to.eql('test event');
        });
    });
});


describe('Apify.readyFreddy()', () => {
    it('it works as expected', () => {
        process.env.APIFY_WATCH_FILE = createWatchFile();
        Apify.readyFreddy();
        return testWatchFileWillBecomeEmpty(process.env.APIFY_WATCH_FILE, 1000);
    });
});

describe('Apify.call()', () => {
    it('works as expected', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: 'RUNNING' });
        const finishedRun = Object.assign({}, run, { status: ACT_TASK_STATUSES.SUCCEEDED });
        const input = 'something';
        const contentType = 'text/plain';
        const output = { contentType, body: 'some-output' };
        const expected = Object.assign({}, finishedRun, { output });
        const build = 'xxx';

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ token, actId, contentType: `${contentType}; charset=utf-8`, body: input, build })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs({ storeId: run.defaultKeyValueStoreId, key: 'OUTPUT', disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, input, { contentType, token, disableBodyParser: true, build })
            .then((callOutput) => {
                expect(callOutput).to.be.eql(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    it('stringifies to JSON', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: 'RUNNING' });
        const finishedRun = Object.assign({}, run, { status: ACT_TASK_STATUSES.SUCCEEDED });
        const input = { a: 'b' };
        const output = { body: 'some-output' }  ;
        const expected = Object.assign({}, finishedRun, { output });
        const build = 'xxx';

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ token, actId, contentType: 'application/json; charset=utf-8', body: JSON.stringify(input, null, 2), build })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs({ storeId: run.defaultKeyValueStoreId, key: 'OUTPUT', disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, input, { token, disableBodyParser: true, build })
            .then((callOutput) => {
                expect(callOutput).to.be.eql(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    it('works as expected with fetchOuput = false', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: 'RUNNING' });
        const finishedRun = Object.assign({}, run, { status: ACT_TASK_STATUSES.SUCCEEDED });

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ token, actId })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, null, { token, fetchOutput: false })
            .then((callOutput) => {
                expect(callOutput).to.be.eql(finishedRun);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    it('timeouts as expected with unfinished run', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: 'RUNNING' });
        const timeoutSecs = 1;

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ token, actId })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: timeoutSecs })
            .once()
            .returns(new Promise((resolve) => {
                setTimeout(() => resolve(runningRun), timeoutSecs * 1000);
            }));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, null, { token, timeoutSecs })
            .then((callOutput) => {
                expect(callOutput).to.be.eql(runningRun);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });
});
