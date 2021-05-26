// eslint-disable-next-line import/no-duplicates
import {
    ENV_VARS,
    KEY_VALUE_STORE_KEYS,
} from 'apify-shared/consts';
import ApifyDefault from '../build/index';
// eslint-disable-next-line import/no-duplicates
import * as ApifyWithWildcard from '../build/index';
import LocalStorageDirEmulator from './local_storage_dir_emulator';
// eslint-disable-next-line global-require
const Apify = require('../build');

describe('Apify module', () => {
    test('import Apify from \'apify\' - should fail', () => {
        expect(ApifyDefault).not.toBeUndefined();
        expect(ApifyDefault.default).toBeUndefined();
    });
    test('import * as Apify from \'apify\'', () => {
        expect(ApifyWithWildcard).not.toBeUndefined();
        expect(ApifyWithWildcard.default).not.toBeUndefined();
    });
    test('const apify = require(\'apify\')', () => {
        expect(Apify).not.toBeUndefined();
        expect(Apify.default).not.toBeUndefined();
    });
});

describe('Apify functions for storages', () => {
    let localStorageEmulator;

    beforeAll(async () => {
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Apify.Configuration.getGlobalConfig().set('localStorageDir', storageDir);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
    });

    describe('Apify.getInput', () => {
        test('should work', async () => {
            const defaultStore = await Apify.openKeyValueStore();
            // Uses default value.
            const oldGet = defaultStore.getValue;
            defaultStore.getValue = async (key) => expect(key).toEqual(KEY_VALUE_STORE_KEYS.INPUT);
            await Apify.getInput();

            // Uses value from env var.
            process.env[ENV_VARS.INPUT_KEY] = 'some-value';
            defaultStore.getValue = async (key) => expect(key).toBe('some-value');
            await Apify.getInput();

            delete process.env[ENV_VARS.INPUT_KEY];

            defaultStore.getValue = oldGet;
        });
    });

    describe('Apify.setValue', () => {
        test('should work', async () => {
            const record = { foo: 'bar' };
            const defaultStore = await Apify.openKeyValueStore();

            const oldSet = defaultStore.setValue;
            defaultStore.setValue = async (key, value) => {
                expect(key).toBe('key-1');
                expect(value).toBe(record);
            };

            await Apify.setValue('key-1', record);

            defaultStore.setValue = oldSet;
        });
    });

    describe('Apify.getValue', () => {
        test('should work', async () => {
            const defaultStore = await Apify.openKeyValueStore();

            const oldGet = defaultStore.getValue;
            defaultStore.getValue = async (key) => expect(key).toBe('key-1');

            await Apify.getValue('key-1');

            defaultStore.getValue = oldGet;
        });
    });

    describe('Apify.pushData', () => {
        test('should work', async () => {
            const defaultStore = await Apify.openKeyValueStore();

            const oldGet = defaultStore.getValue;
            defaultStore.getValue = async (key) => expect(key).toBe('key-1');

            await Apify.getValue('key-1');

            defaultStore.getValue = oldGet;
        });
    });
});
