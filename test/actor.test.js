import path from 'path';
import _ from 'underscore';
import sinon from 'sinon';
import { ENV_VARS, ACT_JOB_STATUSES } from 'apify-shared/consts';
import { ApifyCallError } from '../build/errors';
import * as utils from '../build/utils';

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
                    await utils.sleep(20);
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
    const outputKey = 'OUTPUT';
    const outputValue = 'some-output';
    const build = 'xxx';

    const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
    const finishedRun = { ...run, status: ACT_JOB_STATUSES.SUCCEEDED };
    const failedRun = { ...run, status: ACT_JOB_STATUSES.ABORTED };
    const runningRun = { ...run, status: ACT_JOB_STATUSES.RUNNING };
    const readyRun = { ...run, status: ACT_JOB_STATUSES.READY };

    const output = { contentType, key: outputKey, value: outputValue };
    const expected = { ...finishedRun, output: { contentType, body: outputValue } };

    test('works as expected', async () => {
        const memoryMbytes = 1024;
        const timeoutSecs = 60;
        const webhooks = [{ a: 'a' }, { b: 'b' }];

        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => finishedRun });

        clientMock.expects('keyValueStore')
            .once()
            .withArgs('some-store-id')
            .returns({ getRecord: async () => output });

        const callOutput = await Apify
            .call(actId, input, { contentType, disableBodyParser: true, build, memoryMbytes, timeoutSecs, webhooks });

        expect(callOutput).toEqual(expected);
        clientMock.verify();
    });

    test('works as expected with fetchOutput = false', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => finishedRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Apify
            .call(actId, undefined, { disableBodyParser: true, fetchOutput: false });

        expect(callOutput).toEqual(finishedRun);
        clientMock.restore();
    });

    test('works with token', async () => {
        const memoryMbytes = 1024;
        const timeoutSecs = 60;
        const webhooks = [{ a: 'a' }, { b: 'b' }];

        const utilsMock = sinon.mock(utils);
        const callStub = sinon.stub().resolves(finishedRun);
        const getRecordStub = sinon.stub().resolves(output);
        const keyValueStoreStub = sinon.stub().returns({ getRecord: getRecordStub });
        const actorStub = sinon.stub().returns({ call: callStub });
        utilsMock.expects('newClient')
            .once()
            .withArgs({ token })
            .returns({
                actor: actorStub,
                keyValueStore: keyValueStoreStub,
            });
        const callOutput = await Apify
            .call(actId, input, { contentType, token, disableBodyParser: true, build, memoryMbytes, timeoutSecs, webhooks });

        expect(callOutput).toEqual(expected);
        expect(actorStub.calledOnceWith(actId));
        expect(callStub.args[0]).toEqual([input, {
            build,
            contentType: `${contentType}; charset=utf-8`,
            memory: memoryMbytes,
            timeout: timeoutSecs,
            webhooks,
        }]);
        expect(keyValueStoreStub.calledOnceWith(run.defaultKeyValueStoreId));
        expect(getRecordStub.calledOnceWith('OUTPUT', { buffer: true }));
        utilsMock.verify();
    });

    test('works as expected with unfinished run', async () => {
        const waitSecs = 1;

        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => runningRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Apify
            .call(actId, undefined, { disableBodyParser: true, fetchOutput: false, waitSecs });

        expect(callOutput).toEqual(runningRun);
        clientMock.verify();
    });

    test('returns immediately with zero ', async () => {
        const waitSecs = 0;

        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => readyRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Apify
            .call(actId, undefined, { waitSecs });

        expect(callOutput).toEqual(readyRun);
        clientMock.restore();
    });

    test('throws if run doesn\'t succeed', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => failedRun });

        try {
            await Apify.call(actId, null);
            throw new Error('This was suppose to fail!');
        } catch (err) {
            expect(err).toBeInstanceOf(ApifyCallError);
            expect(err.run.status).toEqual(ACT_JOB_STATUSES.ABORTED);
            expect(err.run).toEqual(failedRun);
            clientMock.restore();
        }
    });
});

describe('Apify.callTask()', () => {
    const taskId = 'some-task-id';
    const actId = 'xxx';
    const token = 'some-token';
    const defaultKeyValueStoreId = 'some-store-id';
    const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
    const readyRun = { ...run, status: ACT_JOB_STATUSES.READY };
    const runningRun = { ...run, status: ACT_JOB_STATUSES.RUNNING };
    const finishedRun = { ...run, status: ACT_JOB_STATUSES.SUCCEEDED };
    const failedRun = { ...run, status: ACT_JOB_STATUSES.ABORTED };
    const contentType = 'application/json';
    const outputKey = 'OUTPUT';
    const outputValue = 'some-output';
    const output = { contentType, key: outputKey, value: outputValue };
    const expected = { ...finishedRun, output: { contentType, body: outputValue } };
    const input = { foo: 'bar' };
    const memoryMbytes = 256;
    const timeoutSecs = 60;
    const build = 'beta';
    const webhooks = [{ a: 'a' }, { b: 'b' }];

    test('works as expected', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => finishedRun });

        clientMock.expects('keyValueStore')
            .once()
            .withArgs('some-store-id')
            .returns({ getRecord: async () => output });

        const callOutput = await Apify
            .callTask(taskId, input, { disableBodyParser: true, memoryMbytes, timeoutSecs, build, webhooks });

        expect(callOutput).toEqual(expected);
        clientMock.restore();
    });

    test('works with token', async () => {
        const utilsMock = sinon.mock(utils);
        const callStub = sinon.stub().resolves(finishedRun);
        const getRecordStub = sinon.stub().resolves(output);
        const keyValueStoreStub = sinon.stub().returns({ getRecord: getRecordStub });
        const taskStub = sinon.stub().returns({ call: callStub });
        utilsMock.expects('newClient')
            .once()
            .withArgs({ token })
            .returns({
                task: taskStub,
                keyValueStore: keyValueStoreStub,
            });
        const callOutput = await Apify
            .callTask(taskId, input, { token, disableBodyParser: true, build, memoryMbytes, timeoutSecs, webhooks });

        expect(callOutput).toEqual(expected);
        expect(taskStub.calledOnceWith(taskId));
        expect(callStub.args[0]).toEqual([input, {
            build,
            memory: memoryMbytes,
            timeout: timeoutSecs,
            webhooks,
        }]);
        expect(keyValueStoreStub.calledOnceWith(run.defaultKeyValueStoreId));
        expect(getRecordStub.calledOnceWith('OUTPUT', { buffer: true }));
        utilsMock.verify();
    });

    test('works as expected with fetchOutput = false', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => finishedRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Apify
            .callTask(taskId, undefined, { disableBodyParser: true, fetchOutput: false });

        expect(callOutput).toEqual(finishedRun);
        clientMock.restore();
    });

    test('works as expected with unfinished run', async () => {
        const waitSecs = 1;

        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => runningRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Apify
            .callTask(taskId, undefined, { disableBodyParser: true, fetchOutput: false, waitSecs });

        expect(callOutput).toEqual(runningRun);
        clientMock.verify();
    });

    test('returns immediately with zero ', async () => {
        const waitSecs = 0;

        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => readyRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Apify
            .callTask(taskId, undefined, { waitSecs });

        expect(callOutput).toEqual(readyRun);
        clientMock.restore();
    });

    test('throws if run doesn\'t succeed', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => failedRun });

        try {
            await Apify.callTask(taskId);
            throw new Error('This was suppose to fail!');
        } catch (err) {
            expect(err).toBeInstanceOf(ApifyCallError);
            expect(err.run.status).toEqual(ACT_JOB_STATUSES.ABORTED);
            expect(err.run).toEqual(failedRun);
            clientMock.restore();
        }
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
        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
    });

    afterEach(() => {
        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];
    });

    test('works as expected', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        const metamorphStub = sinon.stub().resolves(run);
        clientMock.expects('run')
            .once()
            .withArgs('some-run-id', 'some-actor-id')
            .returns({ metamorph: metamorphStub });

        await Apify.metamorph(targetActorId, input, { contentType, build, customAfterSleepMillis: 1 });
        expect(metamorphStub.args[0]).toEqual([targetActorId, input, {
            build,
            contentType: `${contentType}; charset=utf-8`,
        }]);

        clientMock.verify();
    });

    test('works without opts and input', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        const metamorphStub = sinon.stub().resolves(run);
        clientMock.expects('run')
            .once()
            .withArgs('some-run-id', 'some-actor-id')
            .returns({ metamorph: metamorphStub });

        await Apify.metamorph(targetActorId, undefined, { customAfterSleepMillis: 1 });
        expect(metamorphStub.args[0]).toEqual([targetActorId, undefined, {}]);

        clientMock.verify();
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

    test('works', async () => {
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
        process.env[ENV_VARS.IS_AT_HOME] = '1';

        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('webhooks')
            .once()
            .returns({ create: async () => webhook });

        await Apify.addWebhook({
            eventTypes: expectedEventTypes,
            requestUrl: expectedRequestUrl,
            payloadTemplate: expectedPayloadTemplate,
            idempotencyKey: expectedIdempotencyKey,
        });

        delete process.env[ENV_VARS.ACTOR_RUN_ID];
        delete process.env[ENV_VARS.IS_AT_HOME];

        clientMock.verify();
    });

    test('on local logs warning and does nothing', async () => {
        const clientMock = sinon.mock(utils.apifyClient);
        clientMock.expects('webhooks')
            .never();

        const logMock = sinon.mock(log);
        logMock.expects('warning').once();

        await Apify.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });

        clientMock.verify();
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
