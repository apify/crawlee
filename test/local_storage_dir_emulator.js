import { cryptoRandomObjectId } from '@apify/utilities';
import { LOCAL_STORAGE_SUBDIRS, LOCAL_ENV_VARS, ENV_VARS } from '@apify/consts';
import fs from 'fs-extra';
import path from 'path';
import log from '../build/utils_log';
import cacheContainer from '../build/cache_container';

const LOCAL_EMULATION_DIR = path.join(__dirname, '..', 'tmp', 'local-emulation-dir');

const DEFAULT_FOLDERS = Object.values(LOCAL_STORAGE_SUBDIRS)
    .concat([
        `${LOCAL_STORAGE_SUBDIRS.keyValueStores}/${LOCAL_ENV_VARS[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID]}`,
        'live_view',
    ]);

/**
 * Emulates storage for testing purposes.
 * Creates an unique folder with default structure.
 * This class should be used in all tests that are using the storage.
 *
 * Basic usage: Create and initialize `LocalStorageDirEmulator` in beforeAll hook,
 * call `clean()` in afterEach hook and finally call `destroy()` in afterAll hook.
 */
class LocalStorageDirEmulator {
    constructor() {
        this.localStorageDirs = [];
    }

    async init(dirName = cryptoRandomObjectId(10)) {
        cacheContainer.clearAllCaches();
        const localStorageDir = path.resolve(LOCAL_EMULATION_DIR, dirName);
        await fs.ensureDir(localStorageDir);
        // prepare structure
        await this._ensureStructure(localStorageDir);
        process.env.APIFY_LOCAL_STORAGE_DIR = localStorageDir;
        this.localStorageDirs.push(localStorageDir);
        log.debug(`Created local storage emulation in folder ${localStorageDir}`);
        return localStorageDir;
    }

    /**
     * Removes the folder itself
     * @return {Promise}
     */
    async destroy() {
        delete process.env.APIFY_LOCAL_STORAGE_DIR;
        const promises = this.localStorageDirs.map((dir) => {
            return fs.remove(dir);
        });
        return Promise.all(promises);
    }

    async _ensureStructure(localStorageDir) {
        // create first level
        const promises = DEFAULT_FOLDERS.map((folder) => {
            return fs.ensureDir(path.join(localStorageDir, folder));
        });
        return Promise.all(promises);
    }
}

export default LocalStorageDirEmulator;
