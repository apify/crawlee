import log from '@apify/log';
import { cryptoRandomObjectId } from '@apify/utilities';
import { MemoryStorage } from '@crawlee/memory-storage';
import { Configuration } from 'crawlee';
import { ensureDir } from 'fs-extra';
import { resolve } from 'node:path';
import { StorageEmulator } from './StorageEmulator';

const LOCAL_EMULATION_DIR = resolve(__dirname, '..', 'tmp', 'memory-emulation-dir');

export class MemoryStorageEmulator extends StorageEmulator {
    override async init({ dirName = cryptoRandomObjectId(10), persistStorage = false }: MemoryEmulatorOptions = {}) {
        await super.init();
        const localStorageDir = resolve(LOCAL_EMULATION_DIR, dirName);
        this.localStorageDirectories.push(localStorageDir);
        await ensureDir(localStorageDir);

        const storage = new MemoryStorage({ localDataDirectory: localStorageDir, persistStorage, writeMetadata: false });
        Configuration.getGlobalConfig().useStorageClient(storage);
        log.debug(`Initialized emulated memory storage in folder ${localStorageDir}`);
    }

    static override toString() {
        return '@crawlee/memory-storage';
    }
}

export interface MemoryEmulatorOptions {
    dirName?: string;
    persistStorage?: boolean;
}
