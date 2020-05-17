import path from 'path';
import _ from 'underscore';
import sinon from 'sinon';
import { ENV_VARS, ACT_JOB_STATUSES } from 'apify-shared/consts';
import { ApifyCallError } from '../build/errors';
import { sleep } from '../build/utils';

// NOTE: test use of require() here because this is how its done in acts
const Apify = require('../build/index');

const { utils: { log } } = Apify;

// TODO: override console.log() to test the error messages (now they are printed to console)

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


/**
 * Helper function that enables testing of Apify.main()
 * @returns Promise
 */
const testMain = async ({ userFunc, exitCode }) => {
    // Mock process.exit() to check exit code and prevent process exit
    const processMock = sinon.mock(process);
    const exitExpectation = processMock
        .expects('exit')
        .withExactArgs(exitCode)
        .once()
        .returns();

    let error = null;

    try {
        await Promise.resolve()
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
            });
    } finally {
        processMock.restore();
    }
};


const getEmptyEnv = () => {
    return {
        // internalPort: null,
        actId: null,
        actRunId: null,
        userId: null,
        token: null,
        startedAt: null,
        timeoutAt: null,
        defaultKeyValueStoreId: null,
        defaultDatasetId: null,
        memoryMbytes: null,
    };
};

const setEnv = (env) => {
    delete process.env.APIFY_ACT_ID;
    delete process.env.APIFY_ACT_RUN_ID;
    delete process.env.APIFY_USER_ID;
    delete process.env.APIFY_TOKEN;
    delete process.env.APIFY_STARTED_AT;
    delete process.env.APIFY_TIMEOUT_AT;
    delete process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;
    delete process.env.APIFY_DEFAULT_DATASET_ID;

    if (env.actId) process.env.APIFY_ACT_ID = env.actId;
    if (env.actRunId) process.env.APIFY_ACT_RUN_ID = env.actRunId;
    if (env.userId) process.env.APIFY_USER_ID = env.userId;
    if (env.token) process.env.APIFY_TOKEN = env.token;
    if (env.startedAt) process.env.APIFY_STARTED_AT = env.startedAt.toISOString();
    if (env.timeoutAt) process.env.APIFY_TIMEOUT_AT = env.timeoutAt.toISOString();
    if (env.defaultKeyValueStoreId) process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = env.defaultKeyValueStoreId;
    if (env.defaultDatasetId) process.env.APIFY_DEFAULT_DATASET_ID = env.defaultDatasetId;
    if (env.memoryMbytes) process.env.APIFY_MEMORY_MBYTES = env.memoryMbytes.toString();
};

describe('Apify.getEnv()', () => {
    let prevEnv;

    beforeAll(() => {
        prevEnv = Apify.getEnv();
    });

    afterAll(() => {
        setEnv(prevEnv);
    });

    test('works with null values', () => {
        const expectedEnv = getEmptyEnv();
        setEnv(expectedEnv);

        const env = Apify.getEnv();
        expect(env).toMatchObject(expectedEnv);
    });

    test('works with with non-null values', () => {
        const expectedEnv = _.extend(getEmptyEnv(), {
            // internalPort: 12345,
            actId: 'test actId',
            actRunId: 'test actId',
            userId: 'some user',
            token: 'auth token',
            startedAt: new Date('2017-01-01'),
            timeoutAt: new Date(),
            defaultKeyValueStoreId: 'some store',
            defaultDatasetId: 'some dataset',
            memoryMbytes: 1234,
        });
        setEnv(expectedEnv);

        const env = Apify.getEnv();
        expect(env).toMatchObject(expectedEnv);
    });
});

describe('Apify.main()', () => {
    test('throws on invalid args', () => {
        expect(() => {
            Apify.main();
        }).toThrowError(Error);
    });

    test('works with simple user function', () => {
        return testMain({
            userFunc: () => {},
            exitCode: 0,
        });
    });

    test('sets default APIFY_LOCAL_STORAGE_DIR', async () => {
        delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        delete process.env[ENV_VARS.TOKEN];

        await testMain({
            userFunc: () => {
                expect(process.env[ENV_VARS.LOCAL_STORAGE_DIR]).toEqual(path.join(process.cwd(), './apify_storage'));
            },
            exitCode: 0,
        });

        delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
    });

    test('works with promised user function', () => {
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
            exitCode: 0,
        })
            .then(() => {
                expect(called).toBe(true);
            });
    });

    test(
        'on exception in simple user function the process exits with code 91',
        () => {
            return testMain({
                userFunc: () => {
                    throw new Error('Test exception I');
                },
                exitCode: 91,
            });
        },
    );

    test(
        'on exception in promised user function the process exits with code 91',
        () => {
            return testMain({
                userFunc: async () => {
                    await sleep(20);
                    throw new Error('Test exception II');
                },
                exitCode: 91,
            });
        },
    );
});

describe('Apify.call()', () => {
    test('works as expected', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const input = 'something';
        const contentType = 'text/plain';
        const output = { contentType, body: 'some-output' };
        const expected = Object.assign({}, finishedRun, { output });
        const build = 'xxx';
        const memoryMbytes = 1024;
        const timeoutSecs = 60;
        const webhooks = ['a', 'b'];

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({
                token,
                actId,
                contentType: `${contentType}; charset=utf-8`,
                body: input,
                build,
                memory: memoryMbytes,
                timeout: timeoutSecs,
                webhooks,
            })
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
            .call(actId, input, { contentType, token, disableBodyParser: true, build, memoryMbytes, timeoutSecs, webhooks })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('supports legacy "memory" option', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const input = 'something';
        const contentType = 'text/plain';
        const output = { contentType, body: 'some-output' };
        const expected = Object.assign({}, finishedRun, { output });
        const build = 'xxx';
        const memory = 8192;
        const timeoutSecs = 60;

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({
                token,
                actId,
                contentType: `${contentType}; charset=utf-8`,
                body: input,
                build,
                memory,
                timeout: timeoutSecs,
            })
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
            .call(actId, input, { contentType, token, disableBodyParser: true, build, memory, timeoutSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('works without opts and input', () => {
        const actId = 'some-act-id';
        const token = 'token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const output = 'some-output';
        const expected = Object.assign({}, finishedRun, { output });

        Apify.client.setOptions({ token });

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ actId })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs({ storeId: run.defaultKeyValueStoreId, key: 'OUTPUT', disableBodyParser: false })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId)
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('should not fail when run get stuck in READY state', () => {
        const actId = 'some-act-id';
        const token = 'token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const readyRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.READY });

        Apify.client.setOptions({ token });

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ actId })
            .once()
            .returns(Promise.resolve(readyRun));
        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 1 })
            .once()
            .returns(new Promise(resolve => setTimeout(() => resolve(readyRun), 1100)));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, undefined, { waitSecs: 1 })
            .then((callOutput) => {
                expect(callOutput).toEqual(readyRun);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('works without opts with null input', () => {
        const actId = 'some-act-id';
        const token = 'token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const output = 'some-output';
        const expected = Object.assign({}, finishedRun, { output });

        Apify.client.setOptions({ token });

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ actId })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs({ storeId: run.defaultKeyValueStoreId, key: 'OUTPUT', disableBodyParser: false })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, null)
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('works without opts with non-null input', () => {
        const actId = 'some-act-id';
        const token = 'token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const input = { a: 'b' };
        const output = 'some-output';
        const expected = Object.assign({}, finishedRun, { output });

        Apify.client.setOptions({ token });

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ actId, contentType: 'application/json; charset=utf-8', body: JSON.stringify(input, null, 2) })
            .once()
            .returns(Promise.resolve(runningRun));

        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs({ storeId: run.defaultKeyValueStoreId, key: 'OUTPUT', disableBodyParser: false })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, input)
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('stringifies to JSON', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const input = { a: 'b' };
        const output = { body: 'some-output' };
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
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('works as expected with fetchOutput = false', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });

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
                expect(callOutput).toEqual(finishedRun);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('timeouts as expected with unfinished run', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const waitSecs = 1;

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ token, actId })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: waitSecs })
            .once()
            .returns(new Promise((resolve) => {
                setTimeout(() => resolve(runningRun), waitSecs * 1000 * 2);
            }));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, null, { token, waitSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(runningRun);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('handles getRun() returning null the first time', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
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
            .twice()
            .returns(Promise.resolve(null));
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
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('returns immediately with zero ', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const readyRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.READY });
        const waitSecs = 0;

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ token, actId })
            .once()
            .returns(Promise.resolve(readyRun));
        actsMock.expects('getRun').never();

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, null, { token, waitSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(readyRun);
                keyValueStoresMock.restore();
                actsMock.restore();
            });
    });

    test('throws if run doesn\'t succeed', () => {
        const actId = 'some-act-id';
        const token = 'some-token';
        const run = { id: 'some-run-id' };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const failedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.ABORTED });

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('runAct')
            .withExactArgs({ token, actId })
            .once()
            .returns(Promise.resolve(runningRun));
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(failedRun));

        return Apify
            .call(actId, null, { token })
            .then(() => { throw new Error('This was suppose to fail!'); }, (err) => {
                expect(err).toBeInstanceOf(ApifyCallError);
                expect(err.run.status).toEqual(ACT_JOB_STATUSES.ABORTED);
                expect(err.run).toEqual(failedRun);
                actsMock.restore();
            });
    });
});

describe('Apify.callTask()', () => {
    test('works as expected', () => {
        const taskId = 'some-act-id';
        const actId = 'xxx';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const output = { contentType: 'application/json', body: 'some-output' };
        const expected = Object.assign({}, finishedRun, { output });
        const input = { foo: 'bar' };
        const memoryMbytes = 256;
        const timeoutSecs = 60;
        const build = 'beta';
        const webhooks = ['a', 'b'];

        const tasksMock = sinon.mock(Apify.client.tasks);
        tasksMock.expects('runTask')
            .withExactArgs({
                token,
                taskId,
                input,
                memory: memoryMbytes,
                timeout: timeoutSecs,
                build,
                webhooks,
            })
            .once()
            .returns(Promise.resolve(runningRun));

        const actsMock = sinon.mock(Apify.client.acts);
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
            .callTask(taskId, input, { token, disableBodyParser: true, memoryMbytes, timeoutSecs, build, webhooks })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
                tasksMock.restore();
            });
    });

    test('works as expected with fetchOutput = false', () => {
        const taskId = 'some-act-id';
        const actId = 'xxx';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });

        const tasksMock = sinon.mock(Apify.client.tasks);
        tasksMock.expects('runTask')
            .withExactArgs({ token, taskId })
            .once()
            .returns(Promise.resolve(runningRun));

        const actsMock = sinon.mock(Apify.client.acts);
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
            .callTask(taskId, undefined, { token, disableBodyParser: true, fetchOutput: false })
            .then((callOutput) => {
                expect(callOutput).toEqual(finishedRun);
                keyValueStoresMock.restore();
                actsMock.restore();
                tasksMock.restore();
            });
    });

    test('s as expected with unfinished run', () => {
        const waitSecs = 1;
        const taskId = 'some-act-id';
        const actId = 'xxx';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });

        const tasksMock = sinon.mock(Apify.client.tasks);
        tasksMock.expects('runTask')
            .withExactArgs({ token, taskId })
            .once()
            .returns(Promise.resolve(runningRun));

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: waitSecs })
            .once()
            .returns(new Promise((resolve) => {
                setTimeout(() => resolve(runningRun), waitSecs * 1000 * 2);
            }));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .callTask(taskId, undefined, { token, disableBodyParser: true, fetchOutput: false, waitSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(runningRun);
                keyValueStoresMock.restore();
                actsMock.restore();
                tasksMock.restore();
            });
    });

    test('handles getRun() returning null the first time', () => {
        const actId = 'some-act-id';
        const taskId = 'some-act-id';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const runningRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.RUNNING });
        const finishedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.SUCCEEDED });
        const contentType = 'text/plain';
        const output = { contentType, body: 'some-output' };
        const expected = Object.assign({}, finishedRun, { output });

        const tasksMock = sinon.mock(Apify.client.tasks);
        tasksMock.expects('runTask')
            .withExactArgs({ token, taskId })
            .once()
            .returns(Promise.resolve(runningRun));

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('getRun')
            .withExactArgs({ token, actId, runId: run.id, waitForFinish: 999999 })
            .twice()
            .returns(Promise.resolve(null));
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
            .callTask(taskId, undefined, { token, disableBodyParser: true })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                actsMock.restore();
                tasksMock.restore();
            });
    });

    test('returns immediately with zero ', () => {
        const waitSecs = 0;
        const taskId = 'some-act-id';
        const actId = 'xxx';
        const token = 'some-token';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const readyRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.READY });

        const tasksMock = sinon.mock(Apify.client.tasks);
        tasksMock.expects('runTask')
            .withExactArgs({ token, taskId })
            .once()
            .returns(Promise.resolve(readyRun));

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('getRun').never();

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStores);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .callTask(taskId, undefined, { token, waitSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(readyRun);
                keyValueStoresMock.restore();
                actsMock.restore();
                tasksMock.restore();
            });
    });

    test('throws if run doesn\'t succeed', () => {
        const taskId = 'some-act-id';
        const actId = 'xxx';
        const defaultKeyValueStoreId = 'some-store-id';
        const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
        const readyRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.READY });
        const failedRun = Object.assign({}, run, { status: ACT_JOB_STATUSES.ABORTED });

        const tasksMock = sinon.mock(Apify.client.tasks);
        tasksMock.expects('runTask')
            .withExactArgs({ taskId })
            .once()
            .returns(Promise.resolve(readyRun));

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('getRun')
            .withExactArgs({ actId, runId: run.id, waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(failedRun));

        return Apify
            .callTask(taskId)
            .catch((err) => {
                expect(err).toBeInstanceOf(ApifyCallError);
                expect(err.run.status).toEqual(ACT_JOB_STATUSES.ABORTED);
                expect(err.run).toEqual(failedRun);
                actsMock.restore();
                tasksMock.restore();
            });
    });
});

describe('Apify.metamorph()', () => {
    test('works as expected', async () => {
        const runId = 'some-run-id';
        const actorId = 'some-actor-id';
        const targetActorId = 'some-target-actor-id';
        const contentType = 'application/json';
        const input = '{ "foo": "bar" }';
        const build = 'beta';

        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('metamorphRun')
            .withExactArgs({
                runId,
                actId: actorId,
                targetActorId,
                body: input,
                contentType: 'application/json; charset=utf-8',
                build,
            })
            .once()
            .returns(Promise.resolve());


        await Apify.metamorph(targetActorId, input, { contentType, build, customAfterSleepMillis: 1 });

        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];

        actsMock.verify();
        actsMock.restore();
    });

    test('works without opts and input', async () => {
        const runId = 'some-run-id';
        const actorId = 'some-actor-id';
        const targetActorId = 'some-target-actor-id';

        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('metamorphRun')
            .withExactArgs({
                runId,
                actId: actorId,
                targetActorId,
                body: undefined,
                build: undefined,
                contentType: undefined,
            })
            .once()
            .returns(Promise.resolve());


        await Apify.metamorph(targetActorId, undefined, { customAfterSleepMillis: 1 });

        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];

        actsMock.verify();
        actsMock.restore();
    });

    test('stringifies to JSON including functions', async () => {
        const runId = 'some-run-id';
        const actorId = 'some-actor-id';
        const targetActorId = 'some-target-actor-id';
        const input = { foo: 'bar', func: () => { return 123; } };

        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;

        const actsMock = sinon.mock(Apify.client.acts);
        actsMock.expects('metamorphRun')
            .withExactArgs({
                runId,
                actId: actorId,
                targetActorId,
                body: `{
  "foo": "bar",
  "func": "() => {\\n        return 123;\\n      }"
}`,
                contentType: 'application/json; charset=utf-8',
                build: undefined,
            })
            .once()
            .returns(Promise.resolve());

        await Apify.metamorph(targetActorId, input, { customAfterSleepMillis: 1 });

        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];

        actsMock.verify();
        actsMock.restore();
    });
});

describe('Apify.addWebhook()', () => {
    test('works', async () => {
        const runId = 'my-run-id';
        const expectedEventTypes = ['ACTOR.RUN.SUCCEEDED'];
        const expectedRequestUrl = 'http://example.com/api';
        const expectedPayloadTemplate = '{"hello":{{world}}';
        const expectedIdempotencyKey = 'some-key';

        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
        process.env[ENV_VARS.IS_AT_HOME] = '1';

        const webhooksMock = sinon.mock(Apify.client.webhooks);

        const webhook = {
            isAdHoc: true,
            eventTypes: expectedEventTypes,
            condition: {
                actorRunId: runId,
            },
            requestUrl: expectedRequestUrl,
            payloadTemplate: expectedPayloadTemplate,
            idempotencyKey: expectedIdempotencyKey,
        };

        webhooksMock.expects('createWebhook')
            .withExactArgs({ webhook })
            .once()
            .returns(Promise.resolve());


        await Apify.addWebhook({
            eventTypes: expectedEventTypes,
            requestUrl: expectedRequestUrl,
            payloadTemplate: expectedPayloadTemplate,
            idempotencyKey: expectedIdempotencyKey,
        });

        delete process.env[ENV_VARS.ACTOR_RUN_ID];
        delete process.env[ENV_VARS.IS_AT_HOME];

        webhooksMock.verify();
    });

    test('on local logs warning and does nothing', async () => {
        const expectedEventTypes = ['ACTOR.RUN.SUCCEEDED'];
        const expectedRequestUrl = 'http://example.com/api';

        const webhooksMock = sinon.mock(Apify.client.webhooks);
        webhooksMock.expects('createWebhook').never();

        const logMock = sinon.mock(log);
        logMock.expects('warning').once();

        await Apify.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });

        webhooksMock.verify();
        logMock.verify();
    });

    test('should fail without actor run ID', async () => {
        const expectedEventTypes = ['ACTOR.RUN.SUCCEEDED'];
        const expectedRequestUrl = 'http://example.com/api';

        process.env[ENV_VARS.IS_AT_HOME] = '1';

        let isThrow;
        try {
            await Apify.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });
        } catch (err) {
            isThrow = true;
        }
        expect(isThrow).toBe(true);

        delete process.env[ENV_VARS.IS_AT_HOME];
    });
});
