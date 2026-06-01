import { resolve } from 'node:path';

import { MemoryStorage } from '@crawlee/memory-storage';
import { Configuration, serviceLocator } from 'crawlee';
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

        serviceLocator.setStorageClient(this.storage);
        log.debug(`Initialized emulated memory storage in folder ${localStorageDir}`);
    }

    static override toString() {
        return '@crawlee/memory-storage';
    }

    getDataset(id?: string) {
        return this.storage.createDatasetClient(id ? { id } : { alias: '__default__' });
    }

    async getDatasetItems(id?: string) {
        const dataset = await this.getDataset(id);
        return (await dataset.getData()).items;
    }

    getRequestQueue(id?: string) {
        return this.storage.createRequestQueueClient(id ? { id } : { alias: '__default__' });
    }

    async getRequestQueueItems(id?: string) {
        const requestQueue = await this.getRequestQueue(id);
        const { items: heads } = await requestQueue.listHead();
        return heads;
    }

    getKeyValueStore(id?: string) {
        return this.storage.createKeyValueStoreClient(id ? { id } : { alias: '__default__' });
    }

    async getState() {
        return await (await this.getKeyValueStore()).getValue('CRAWLEE_STATE');
    }
}

export interface MemoryEmulatorOptions {
    dirName?: string;
    persistStorage?: boolean;
}
