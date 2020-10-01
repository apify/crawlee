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
    const token = 'some-token';
    const actId = 'some-act-id';
    const defaultKeyValueStoreId = 'some-store-id';
    const input = 'something';
    const contentType = 'text/plain';
    const build = 'xxx';

    const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
    const runningRun = { ...run, status: ACT_JOB_STATUSES.RUNNING };
    const finishedRun = { ...run, status: ACT_JOB_STATUSES.SUCCEEDED };
    const readyRun = { ...run, status: ACT_JOB_STATUSES.READY };
    const failedRun = { ...run, status: ACT_JOB_STATUSES.ABORTED };

    const output = { contentType, input: 'some-output' };
    const expected = { ...finishedRun, output };

    beforeEach(() => {
        const clientMock = sinon.mock(Apify.client);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({});

        clientMock.expects('run')
            .once()
            .withArgs('some-run-id', 'some-act-id')
            .returns({ get: async () => ({ ...run }) });

        clientMock.expects('keyValueStore')
            .once()
            .withArgs('some-store-id')
            .returns({ getRecord: async () => ({ ...output }) });
    });
    test('works as expected', () => {
        const memoryMbytes = 1024;
        const timeoutSecs = 60;
        const webhooks = [{ a: 'a' }, { b: 'b' }];

        const clientMock = sinon.mock(Apify.client);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ start: async () => ({ ...runningRun }) });

        clientMock.expects('run')
            .once()
            .withArgs('some-run-id', 'some-act-id')
            .returns({ get: async () => ({ ...runningRun }) });

        clientMock.expects('run')
            .once()
            .withArgs('some-run-id', 'some-act-id')
            .returns({ get: async () => ({ ...finishedRun }) });


        clientMock.expects('keyValueStore')
            .once()
            .withArgs('some-store-id')
            .returns({ getRecord: async () => ({ ...output }) });

        return Apify
            .call(actId, input, { contentType, token, disableBodyParser: true, build, memoryMbytes, timeoutSecs, webhooks })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                clientMock.restore();
            });
    });

    test('works without opts and input', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs('OUTPUT', { disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId)
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                runMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('should not fail when run get stuck in READY state', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .once()
            .returns(Promise.resolve(readyRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 1 })
            .once()
            .returns(new Promise((resolve) => setTimeout(() => resolve(readyRun), 1100)));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, undefined, { waitSecs: 1 })
            .then((callOutput) => {
                expect(callOutput).toEqual(readyRun);
                runMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('works without opts with null input', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs('OUTPUT', { disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, null)
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                runMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('works without opts with non-null input', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .withExactArgs({ contentType: 'application/json; charset=utf-8', input: JSON.stringify(input, null, 2) })
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs('OUTPUT', { disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, input)
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                runMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('stringifies to JSON', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .withExactArgs({ contentType: 'application/json; charset=utf-8', input: JSON.stringify(input, null, 2), build })
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs('OUTPUT', { disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, input, { token, disableBodyParser: true, build })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                runMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('works as expected with fetchOutput = false', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, null, { token, fetchOutput: false })
            .then((callOutput) => {
                expect(callOutput).toEqual(finishedRun);
                actorMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('timeouts as expected with unfinished run', () => {
        const waitSecs = 1;

        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: waitSecs })
            .once()
            .returns(new Promise((resolve) => {
                setTimeout(() => resolve(runningRun), waitSecs * 1000 * 2);
            }));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, null, { token, waitSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(runningRun);
                keyValueStoresMock.restore();
                actorMock.restore();
                runMock.restore();
            });
    });

    test('handles getRun() returning null the first time', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .withExactArgs({ contentType: `${contentType}; charset=utf-8`, input, build })
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .twice()
            .returns(Promise.resolve(null));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs('OUTPUT', { disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .call(actId, input, { contentType, token, disableBodyParser: true, build })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                runMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('returns immediately with zero ', () => {
        const waitSecs = 0;
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .once()
            .returns(Promise.resolve(readyRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get').never();

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .call(actId, null, { token, waitSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(readyRun);
                runMock.restore();
                keyValueStoresMock.restore();
                actorMock.restore();
            });
    });

    test('throws if run doesn\'t succeed', () => {
        const actorMock = sinon.mock(Apify.client.actor);
        actorMock.expects('start')
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(failedRun));

        return Apify
            .call(actId, null, { token })
            .then(() => { throw new Error('This was suppose to fail!'); }, (err) => {
                expect(err).toBeInstanceOf(ApifyCallError);
                expect(err.run.status).toEqual(ACT_JOB_STATUSES.ABORTED);
                expect(err.run).toEqual(failedRun);
                runMock.restore();
                actorMock.restore();
            });
    });
});

describe('Apify.callTask()', () => {
    const taskId = 'some-act-id';
    const actId = 'xxx';
    const token = 'some-token';
    const defaultKeyValueStoreId = 'some-store-id';
    const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
    const readyRun = { ...run, status: ACT_JOB_STATUSES.READY };
    const runningRun = { ...run, status: ACT_JOB_STATUSES.RUNNING };
    const finishedRun = { ...run, status: ACT_JOB_STATUSES.SUCCEEDED };
    const failedRun = { ...run, status: ACT_JOB_STATUSES.ABORTED };
    const output = { contentType: 'application/json', body: 'some-output' };
    const expected = { ...finishedRun, output };
    const input = { foo: 'bar' };
    const memoryMbytes = 256;
    const timeoutSecs = 60;
    const build = 'beta';
    const webhooks = [{ a: 'a' }, { b: 'b' }];

    beforeEach(() => {
        const clientMock = sinon.mock(Apify.client);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ start: async () => ({ ...runningRun }) });

        clientMock.expects('run')
            .once()
            .withArgs('some-run-id', 'some-act-id')
            .returns({ get: async () => ({ ...run }) });

        clientMock.expects('keyValueStore')
            .once()
            .withArgs('some-store-id')
            .returns({ getRecord: async () => ({ ...output }) });
    });

    test('works as expected', () => {
        const tasksMock = sinon.mock(Apify.client.task);
        tasksMock.expects('start')
            .withExactArgs({
                input,
                memory: memoryMbytes,
                timeout: timeoutSecs,
                build,
                webhooks,
            })
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs('OUTPUT', { disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .callTask(taskId, input, { token, disableBodyParser: true, memoryMbytes, timeoutSecs, build, webhooks })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                runMock.restore();
                tasksMock.restore();
            });
    });

    test('works as expected with fetchOutput = false', () => {
        const tasksMock = sinon.mock(Apify.client.task);
        tasksMock.expects('start')
            .withExactArgs({
                input,
                memory: memoryMbytes,
                timeout: timeoutSecs,
                build,
                webhooks,
            })
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(runningRun));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .once()
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .callTask(taskId, undefined, { token, disableBodyParser: true, fetchOutput: false })
            .then((callOutput) => {
                expect(callOutput).toEqual(finishedRun);
                keyValueStoresMock.restore();
                runMock.restore();
                tasksMock.restore();
            });
    });

    test('works as expected with unfinished run', () => {
        const waitSecs = 1;

        const tasksMock = sinon.mock(Apify.client.task);
        tasksMock.expects('start')
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: waitSecs })
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
                runMock.restore();
                tasksMock.restore();
            });
    });

    test('handles getRun() returning null the first time', () => {
        const tasksMock = sinon.mock(Apify.client.task);
        tasksMock.expects('start')
            .once()
            .returns(Promise.resolve(runningRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .returns(Promise.resolve(null));

        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .returns(Promise.resolve(finishedRun));

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord')
            .withExactArgs('OUTPUT', { disableBodyParser: true })
            .once()
            .returns(Promise.resolve(output));

        return Apify
            .callTask(taskId, undefined, { token, disableBodyParser: true })
            .then((callOutput) => {
                expect(callOutput).toEqual(expected);
                keyValueStoresMock.restore();
                runMock.restore();
                tasksMock.restore();
            });
    });

    test('returns immediately with zero ', () => {
        const waitSecs = 0;

        const tasksMock = sinon.mock(Apify.client.task);
        tasksMock.expects('start')
            .once()
            .returns(Promise.resolve(readyRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get').never();

        const keyValueStoresMock = sinon.mock(Apify.client.keyValueStore);
        keyValueStoresMock.expects('getRecord').never();

        return Apify
            .callTask(taskId, undefined, { token, waitSecs })
            .then((callOutput) => {
                expect(callOutput).toEqual(readyRun);
                keyValueStoresMock.restore();
                runMock.restore();
                tasksMock.restore();
            });
    });

    test('throws if run doesn\'t succeed', () => {
        const tasksMock = sinon.mock(Apify.client.task);
        tasksMock.expects('start')
            .once()
            .returns(Promise.resolve(readyRun));

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('get')
            .withExactArgs({ waitForFinish: 999999 })
            .returns(Promise.resolve(failedRun));

        return Apify
            .callTask(taskId)
            .catch((err) => {
                expect(err).toBeInstanceOf(ApifyCallError);
                expect(err.run.status).toEqual(ACT_JOB_STATUSES.ABORTED);
                expect(err.run).toEqual(failedRun);
                runMock.restore();
                tasksMock.restore();
            });
    });
});

describe('Apify.metamorph()', () => {
    const runId = 'some-run-id';
    const actorId = 'some-actor-id';
    const targetActorId = 'some-target-actor-id';
    const contentType = 'application/json';
    const input = '{ "foo": "bar" }';
    const build = 'beta';
    const run = { id: runId, actId: actorId };

    beforeEach(() => {
        const clientMock = sinon.mock(Apify.client);

        clientMock.expects('run')
            .once()
            .withArgs('some-run-id', 'some-act-id')
            .returns({ get: async () => ({ ...run }) });
    });

    test('works as expected', async () => {
        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('metamorph')
            .withExactArgs({
                targetActorId,
                input,
                contentType: 'application/json; charset=utf-8',
                build,
            })
            .once()
            .returns(Promise.resolve());

        await Apify.metamorph(targetActorId, input, { contentType, build, customAfterSleepMillis: 1 });

        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];

        runMock.verify();
        runMock.restore();
    });

    test('works without opts and input', async () => {
        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('metamorph')
            .withExactArgs({
                targetActorId,
                input: undefined,
                build: undefined,
                contentType: undefined,
            })
            .once()
            .returns(Promise.resolve());

        await Apify.metamorph(targetActorId, undefined, { customAfterSleepMillis: 1 });

        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];

        runMock.verify();
        runMock.restore();
    });

    test('stringifies to JSON including functions', async () => {
        const actualInput = { foo: 'bar', func: () => { return 123; } };

        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;

        const runMock = sinon.mock(Apify.client.run);
        runMock.expects('metamorph')
            .withExactArgs({
                targetActorId,
                input: `{
                            "foo": "bar",
                            "func": "() => {\\n        return 123;\\n      }"
                }`,
                contentType: 'application/json; charset=utf-8',
                build: undefined,
            })
            .once()
            .returns(Promise.resolve());

        await Apify.metamorph(targetActorId, actualInput, { customAfterSleepMillis: 1 });

        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];

        runMock.verify();
        runMock.restore();
    });
});

describe('Apify.addWebhook()', () => {
    const runId = 'my-run-id';
    const expectedEventTypes = ['ACTOR.RUN.SUCCEEDED'];
    const expectedRequestUrl = 'http://example.com/api';
    const expectedPayloadTemplate = '{"hello":{{world}}';
    const expectedIdempotencyKey = 'some-key';
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

    beforeEach(() => {
        const clientMock = sinon.mock(Apify.client);

        clientMock.expects('webhooks')
            .returns({ create: async () => ({ ...webhook }) });
    });

    test('works', async () => {
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
        process.env[ENV_VARS.IS_AT_HOME] = '1';

        const webhooksMock = sinon.mock(Apify.client.webhooks);
        webhooksMock.expects('create')
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
        const webhooksMock = sinon.mock(Apify.client.webhooks);
        webhooksMock.expects('create').never();

        const logMock = sinon.mock(log);
        logMock.expects('warning').once();

        await Apify.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });

        webhooksMock.verify();
        logMock.verify();
    });

    test('should fail without actor run ID', async () => {
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
