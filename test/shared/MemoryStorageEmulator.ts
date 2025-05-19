import { resolve } from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import { Configuration } from 'crawlee';
import { ensureDir } from 'fs-extra';

import log from '@apify/log';
import { cryptoRandomObjectId } from '@apify/utilities';

import { StorageEmulator } from './StorageEmulator.js';

const LOCAL_EMULATION_DIR = resolve(import.meta.dirname, '..', 'tmp', 'memory-emulation-dir');

export class MemoryStorageEmulator extends StorageEmulator {
    private storage!: MemoryStorage;

    override async init({ dirName = cryptoRandomObjectId(10), persistStorage = false }: MemoryEmulatorOptions = {}) {
        await super.init();
        const localStorageDir = resolve(LOCAL_EMULATION_DIR, dirName);
        this.localStorageDirectories.push(localStorageDir);
        await ensureDir(localStorageDir);

        this.storage = new MemoryStorage({ localDataDirectory: localStorageDir, persistStorage, writeMetadata: false });

        Configuration.getGlobalConfig().useStorageClient(this.storage);
        log.debug(`Initialized emulated memory storage in folder ${localStorageDir}`);
    }

    static override toString() {
        return '@crawlee/memory-storage';
    }

    getDataset(id?: string) {
        return this.storage.dataset(id ?? Configuration.getGlobalConfig().get('defaultDatasetId'));
    }

    async getDatasetItems(id?: string) {
        const dataset = this.getDataset(id);
        return (await dataset.listItems()).items;
    }

    getRequestQueue(id?: string) {
        return this.storage.requestQueue(id ?? Configuration.getGlobalConfig().get('defaultRequestQueueId'));
    }

    async getRequestQueueItems(id?: string) {
        const requestQueue = this.getRequestQueue(id);
        const { items: heads } = await requestQueue.listHead();
        return heads;
    }

    getKeyValueStore(id?: string) {
        return this.storage.keyValueStore(id ?? Configuration.getGlobalConfig().get('defaultKeyValueStoreId'));
    }

    async getState() {
        return await this.getKeyValueStore().getRecord('CRAWLEE_STATE');
    }
}

export interface MemoryEmulatorOptions {
    dirName?: string;
    persistStorage?: boolean;
}
