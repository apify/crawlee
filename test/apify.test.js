import path from 'path';
import _ from 'underscore';
import { ACT_JOB_STATUSES, ENV_VARS, KEY_VALUE_STORE_KEYS } from '@apify/consts';
import { ApifyClient } from 'apify-client';
import { ApifyCallError } from '../build/errors';
import * as utils from '../build/utils';
import { Dataset } from '../build/storages/dataset';
import { KeyValueStore } from '../build/storages/key_value_store';
import LocalStorageDirEmulator from './local_storage_dir_emulator';
import { StorageManager } from '../build/storages/storage_manager';
import { ProxyConfiguration } from '../build/proxy_configuration';
import { SessionPool } from '../build/session_pool/session_pool';

// NOTE: test use of require() here because this is how its done in acts
const { Apify, Configuration, RequestList, utils: { log, sleep } } = require('../build/index');

/**
 * Helper function that enables testing of Apify.main()
 */
const testMain = async ({ userFunc, exitCode }) => {
    const exitSpy = jest.spyOn(process, 'exit');
    exitSpy.mockImplementationOnce((i) => i); // prevent `process.exit()`

    let error = null;
    const sdk = new Apify();

    try {
        await sdk.main(() => {
            sdk.config.get('');
            if (userFunc) {
                return userFunc(sdk);
            }
        }).catch((err) => { error = err; });

        // Waits max 1000 millis for process.exit() mock to be called
        await new Promise((resolve) => {
            const waitUntil = Date.now() + 1000;
            const intervalId = setInterval(() => {
                if (exitSpy.mock.calls.length === 0 && Date.now() < waitUntil) {
                    return;
                }
                clearInterval(intervalId);
                resolve();
            }, 10);
        });

        if (error) {
            throw error;
        }
    } finally {
        expect(exitSpy).toBeCalledWith(exitCode);
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

describe('new Apify({ ... })', () => {
    afterEach(() => jest.restoreAllMocks());

    describe('getEnv()', () => {
        let prevEnv;

        beforeAll(() => { prevEnv = new Apify().getEnv(); });
        afterAll(() => { setEnv(prevEnv); });

        test('works with null values', () => {
            const expectedEnv = getEmptyEnv();
            setEnv(expectedEnv);

            const env = new Apify().getEnv();
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

            const env = new Apify().getEnv();
            expect(env).toMatchObject(expectedEnv);
        });
    });

    describe('main()', () => {
        test('throws on invalid args', () => {
            expect(() => {
                new Apify().main();
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
                userFunc: (sdk) => {
                    expect(sdk.config.get('localStorageDir')).toEqual(path.join(process.cwd(), './apify_storage'));
                },
                exitCode: 0,
            });

            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        });

        test('respects `localStorageEnableWalMode` option (gh issue #956)', async () => {
            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
            delete process.env[ENV_VARS.TOKEN];

            const sdk1 = new Apify();
            const sessionPool1 = await sdk1.openSessionPool();
            expect(sessionPool1).toBeInstanceOf(SessionPool);
            const storage1 = sdk1.config.getStorageLocal();
            expect(storage1.enableWalMode).toBe(true);

            const sdk2 = new Apify({ localStorageEnableWalMode: false });
            const sessionPool2 = await sdk2.openSessionPool();
            expect(sessionPool2).toBeInstanceOf(SessionPool);
            const storage2 = sdk2.config.getStorageLocal();
            expect(storage2.enableWalMode).toBe(false);

            delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        });

        test('works with promised user function', async () => {
            let called = false;
            await testMain({
                userFunc: async () => {
                    await sleep(20);
                    called = true;
                },
                exitCode: 0,
            });
            expect(called).toBe(true);
        });

        test('on exception in simple user function the process exits with code 91', async () => {
            await testMain({
                userFunc: () => {
                    throw new Error('Test exception I');
                },
                exitCode: 91,
            });
        });

        test('on exception in promised user function the process exits with code 91', async () => {
            await testMain({
                userFunc: async () => {
                    await utils.sleep(20);
                    throw new Error('Test exception II');
                },
                exitCode: 91,
            });
        });
    });

    describe('call()', () => {
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

            const getRecordMock = jest.fn();
            getRecordMock.mockResolvedValueOnce(output);
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(finishedRun);
            const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
            actorSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');
            keyValueStoreSpy.mockReturnValueOnce({ getRecord: getRecordMock });

            const callOutput = await new Apify().call(actId, input, {
                contentType,
                disableBodyParser: true,
                build,
                memoryMbytes,
                timeoutSecs,
                webhooks,
            });

            expect(callOutput).toEqual(expected);
            expect(keyValueStoreSpy).toBeCalledTimes(1);
            expect(keyValueStoreSpy).toBeCalledWith('some-store-id');
        });

        test('works as expected with fetchOutput = false', async () => {
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(finishedRun);
            const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');
            actorSpy.mockReturnValueOnce({ call: callMock });

            const callOutput = await new Apify().call(actId, undefined, { disableBodyParser: true, fetchOutput: false });

            expect(keyValueStoreSpy).not.toBeCalled();
            expect(callOutput).toEqual(finishedRun);
        });

        test('works with token', async () => {
            const memoryMbytes = 1024;
            const timeoutSecs = 60;
            const webhooks = [{ a: 'a' }, { b: 'b' }];

            const newClientSpy = jest.spyOn(Apify.prototype, 'newClient');
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(finishedRun);
            const getRecordMock = jest.fn();
            getRecordMock.mockResolvedValueOnce(output);
            const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
            actorSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');
            keyValueStoreSpy.mockReturnValueOnce({ getRecord: getRecordMock });

            const callOutput = await new Apify({ token }).call(actId, input, {
                contentType,
                disableBodyParser: true,
                build,
                memoryMbytes,
                timeoutSecs,
                webhooks,
            });

            expect(callOutput).toEqual(expected);
            expect(newClientSpy).toBeCalledWith({ token });
            expect(actorSpy).toBeCalledWith(actId);
            expect(callMock).toBeCalledWith(input, {
                token,
                build,
                contentType: `${contentType}; charset=utf-8`,
                memory: memoryMbytes,
                timeout: timeoutSecs,
                webhooks,
            });
            expect(keyValueStoreSpy).toBeCalledWith(run.defaultKeyValueStoreId);
            expect(getRecordMock).toBeCalledWith('OUTPUT', { buffer: true });
        });

        test('works as expected with unfinished run', async () => {
            const waitSecs = 1;

            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(runningRun);
            const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
            actorSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');

            const callOutput = await new Apify().call(actId, undefined, { disableBodyParser: true, fetchOutput: false, waitSecs });

            expect(callOutput).toEqual(runningRun);
            expect(actorSpy).toBeCalledWith('some-act-id');
            expect(keyValueStoreSpy).not.toBeCalled();
        });

        test('returns immediately with zero ', async () => {
            const waitSecs = 0;

            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(readyRun);
            const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
            actorSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');

            const callOutput = await new Apify().call(actId, undefined, { waitSecs });

            expect(callOutput).toEqual(readyRun);
            expect(actorSpy).toBeCalledWith('some-act-id');
            expect(keyValueStoreSpy).not.toBeCalled();
        });

        test("throws if run doesn't succeed", async () => {
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(failedRun);
            const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
            actorSpy.mockReturnValueOnce({ call: callMock });

            // eslint-disable-next-line max-len
            const err = 'The actor some-act-id invoked by Apify.call() did not succeed. For details, see https://console.apify.com/view/runs/some-run-id';
            await expect(new Apify().call(actId, null)).rejects.toThrowError(new ApifyCallError(failedRun, err));

            expect(actorSpy).toBeCalledWith('some-act-id');
        });
    });

    describe('callTask()', () => {
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
            const getRecordMock = jest.fn();
            getRecordMock.mockResolvedValueOnce(output);
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(finishedRun);
            const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
            taskSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');
            keyValueStoreSpy.mockReturnValueOnce({ getRecord: getRecordMock });

            const callOutput = await new Apify().callTask(taskId, input, { disableBodyParser: true, memoryMbytes, timeoutSecs, build, webhooks });

            expect(callOutput).toEqual(expected);
            expect(taskSpy).toBeCalledWith('some-task-id');
        });

        test('works with token', async () => {
            const newClientSpy = jest.spyOn(Apify.prototype, 'newClient');
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(finishedRun);
            const getRecordMock = jest.fn();
            getRecordMock.mockResolvedValueOnce(output);
            const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
            taskSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');
            keyValueStoreSpy.mockReturnValueOnce({ getRecord: getRecordMock });

            const callOutput = await new Apify({ token }).callTask(taskId, input, {
                disableBodyParser: true,
                build,
                memoryMbytes,
                timeoutSecs,
                webhooks,
            });

            expect(callOutput).toEqual(expected);
            expect(newClientSpy).toBeCalledWith({ token });
            expect(taskSpy).toBeCalledWith(taskId);
            expect(callMock).toBeCalledWith(input, {
                token,
                build,
                memory: memoryMbytes,
                timeout: timeoutSecs,
                webhooks,
            });
            expect(keyValueStoreSpy).toBeCalledWith(run.defaultKeyValueStoreId);
            expect(getRecordMock).toBeCalledWith('OUTPUT', { buffer: true });
        });

        test('works as expected with fetchOutput = false', async () => {
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(finishedRun);
            const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');
            taskSpy.mockReturnValueOnce({ call: callMock });

            const callOutput = await new Apify().callTask(taskId, undefined, { disableBodyParser: true, fetchOutput: false });

            expect(keyValueStoreSpy).not.toBeCalled();
            expect(callOutput).toEqual(finishedRun);
            expect(taskSpy).toBeCalledWith('some-task-id');
        });

        test('works as expected with unfinished run', async () => {
            const waitSecs = 1;

            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(runningRun);
            const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
            taskSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');

            const callOutput = await new Apify().callTask(taskId, undefined, { disableBodyParser: true, fetchOutput: false, waitSecs });

            expect(callOutput).toEqual(runningRun);
            expect(keyValueStoreSpy).not.toBeCalled();
            expect(taskSpy).toBeCalledWith('some-task-id');
        });

        test('returns immediately with zero ', async () => {
            const waitSecs = 0;

            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(readyRun);
            const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
            taskSpy.mockReturnValueOnce({ call: callMock });
            const keyValueStoreSpy = jest.spyOn(ApifyClient.prototype, 'keyValueStore');

            const callOutput = await new Apify().callTask(taskId, undefined, { waitSecs });

            expect(callOutput).toEqual(readyRun);
            expect(keyValueStoreSpy).not.toBeCalled();
            expect(taskSpy).toBeCalledWith('some-task-id');
        });

        test("throws if run doesn't succeed", async () => {
            const callMock = jest.fn();
            callMock.mockResolvedValueOnce(failedRun);
            const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
            taskSpy.mockReturnValueOnce({ call: callMock });

            // eslint-disable-next-line max-len
            const err = 'The actor task some-task-id invoked by Apify.callTask() did not succeed. For details, see https://console.apify.com/view/runs/some-run-id';
            await expect(new Apify().callTask(taskId)).rejects.toThrowError(new ApifyCallError(failedRun, err));

            expect(taskSpy).toBeCalledWith('some-task-id');
        });
    });

    describe('metamorph()', () => {
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
            const metamorphMock = jest.fn();
            metamorphMock.mockResolvedValueOnce(run);
            const runSpy = jest.spyOn(ApifyClient.prototype, 'run');
            runSpy.mockReturnValueOnce({ metamorph: metamorphMock });

            await new Apify().metamorph(targetActorId, input, { contentType, build, customAfterSleepMillis: 1 });

            expect(metamorphMock).toBeCalledWith(targetActorId, input, {
                build,
                contentType: `${contentType}; charset=utf-8`,
            });
        });

        test('works without opts and input', async () => {
            const metamorphMock = jest.fn();
            metamorphMock.mockResolvedValueOnce(run);
            const runSpy = jest.spyOn(ApifyClient.prototype, 'run');
            runSpy.mockReturnValueOnce({ metamorph: metamorphMock });

            await new Apify().metamorph(targetActorId, undefined, { customAfterSleepMillis: 1 });

            expect(metamorphMock).toBeCalledWith(targetActorId, undefined, {});
        });
    });

    describe('addWebhook()', () => {
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

            const createMock = jest.fn();
            createMock.mockResolvedValueOnce(webhook);
            const webhooksSpy = jest.spyOn(ApifyClient.prototype, 'webhooks');
            webhooksSpy.mockReturnValueOnce({ create: createMock });

            await new Apify().addWebhook({
                eventTypes: expectedEventTypes,
                requestUrl: expectedRequestUrl,
                payloadTemplate: expectedPayloadTemplate,
                idempotencyKey: expectedIdempotencyKey,
            });

            delete process.env[ENV_VARS.ACTOR_RUN_ID];
            delete process.env[ENV_VARS.IS_AT_HOME];

            expect(webhooksSpy).toBeCalledTimes(1);
        });

        test('on local logs warning and does nothing', async () => {
            const metamorphMock = jest.fn();
            const warningMock = jest.spyOn(log, 'warning');
            const runSpy = jest.spyOn(ApifyClient.prototype, 'run');
            runSpy.mockReturnValueOnce({ metamorph: metamorphMock });

            const sdk = new Apify();
            await sdk.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });

            expect(metamorphMock).not.toBeCalled();
            expect(warningMock).toBeCalledTimes(2);
            // eslint-disable-next-line max-len
            expect(warningMock).toBeCalledWith(`Neither APIFY_LOCAL_STORAGE_DIR nor APIFY_TOKEN environment variable is set, defaulting to APIFY_LOCAL_STORAGE_DIR="${sdk.config.get('localStorageDir')}"`);
            // eslint-disable-next-line max-len
            expect(warningMock).toBeCalledWith('Apify.addWebhook() is only supported when running on the Apify platform. The webhook will not be invoked.');
        });

        test('should fail without actor run ID', async () => {
            process.env[ENV_VARS.IS_AT_HOME] = '1';

            let isThrow;
            try {
                await new Apify().addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });
            } catch (err) {
                isThrow = true;
            }
            expect(isThrow).toBe(true);

            delete process.env[ENV_VARS.IS_AT_HOME];
        });

        test('openSessionPool should create SessionPool', async () => {
            const sdk = new Apify();
            const initializeSpy = jest.spyOn(SessionPool.prototype, 'initialize');
            initializeSpy.mockImplementationOnce((i) => i);
            await sdk.openSessionPool();
            expect(initializeSpy).toBeCalledTimes(1);
        });

        test('createProxyConfiguration should create ProxyConfiguration', async () => {
            const sdk = new Apify();
            const initializeSpy = jest.spyOn(ProxyConfiguration.prototype, 'initialize');
            initializeSpy.mockImplementationOnce((i) => i);
            await sdk.createProxyConfiguration();
            expect(initializeSpy).toBeCalledTimes(1);
        });
    });

    describe('Storage API', () => {
        let localStorageEmulator;
        let sdk;

        beforeAll(() => { localStorageEmulator = new LocalStorageDirEmulator(); });
        beforeEach(async () => { sdk = new Apify({ localStorageDir: await localStorageEmulator.init() }); });
        afterAll(() => localStorageEmulator.destroy());

        test('getInput()', async () => {
            const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
            getValueSpy.mockImplementation(() => 123);

            // Uses default value.
            const val1 = await sdk.getInput();
            expect(getValueSpy).toBeCalledTimes(1);
            expect(getValueSpy).toBeCalledWith(KEY_VALUE_STORE_KEYS.INPUT);
            expect(val1).toBe(123);

            // Uses value from config
            sdk.config.set('inputKey', 'some-value');
            const val2 = await sdk.getInput();
            expect(getValueSpy).toBeCalledTimes(2);
            expect(getValueSpy).toBeCalledWith('some-value');
            expect(val2).toBe(123);
            sdk.config.set('inputKey', undefined); // restore defaults
        });

        test('setValue()', async () => {
            const record = { foo: 'bar' };
            const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');
            setValueSpy.mockImplementationOnce((i) => i);

            await sdk.setValue('key-1', record);
            expect(setValueSpy).toBeCalledTimes(1);
            expect(setValueSpy).toBeCalledWith('key-1', record, undefined);
        });

        test('getValue()', async () => {
            const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
            getValueSpy.mockImplementationOnce(() => 123);

            const val = await sdk.getValue('key-1');
            expect(getValueSpy).toBeCalledTimes(1);
            expect(getValueSpy).toBeCalledWith('key-1');
            expect(val).toBe(123);
        });

        test('pushData()', async () => {
            const pushDataSpy = jest.spyOn(Dataset.prototype, 'pushData');
            pushDataSpy.mockImplementationOnce((i) => i);

            await sdk.pushData({ foo: 'bar' });
            expect(pushDataSpy).toBeCalledTimes(1);
            expect(pushDataSpy).toBeCalledWith({ foo: 'bar' });
        });

        test('openRequestList should create RequestList', async () => {
            const initializeSpy = jest.spyOn(RequestList.prototype, 'initialize');
            initializeSpy.mockImplementationOnce((i) => i);
            const list = await sdk.openRequestList('my-list', ['url-1', 'url-2', 'url-3']);
            expect(initializeSpy).toBeCalledTimes(1);
            expect(list.sources).toEqual(['url-1', 'url-2', 'url-3']);
            expect(list.persistStateKey).toBe('SDK_my-list-REQUEST_LIST_STATE');
            expect(list.persistRequestsKey).toBe('SDK_my-list-REQUEST_LIST_REQUESTS');
        });

        test('openRequestQueue should open storage', async () => {
            const queueId = 'abc';
            const options = { forceCloud: true };
            const openStorageSpy = jest.spyOn(StorageManager.prototype, 'openStorage');
            openStorageSpy.mockImplementationOnce((i) => i);
            await sdk.openRequestQueue(queueId, options);
            expect(openStorageSpy).toBeCalledWith(queueId, options);
            expect(openStorageSpy).toBeCalledTimes(1);
        });

        test('openRequestQueue works with APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE=false', async () => {
            process.env.APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE = 'false';
            const config = new Configuration();
            const enableWalMode = config.get('localStorageEnableWalMode');
            expect(enableWalMode).toBe(false);
        });
    });
});
