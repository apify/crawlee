import { cryptoRandomObjectId } from 'apify-shared/utilities';
import { LOCAL_STORAGE_SUBDIRS, LOCAL_ENV_VARS, ENV_VARS } from 'apify-shared/consts';
import fs from 'fs-extra';
import path from 'path';
import log from 'apify-shared/log';

import { LOCAL_STORAGE_DIR } from './_helper';

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
    constructor(localStorageDir = cryptoRandomObjectId(10)) {
        this.localStorageDir = path.join(LOCAL_STORAGE_DIR, localStorageDir);
        log.debug(`Created local storage emulation in folder ${this.localStorageDir}`);
    }

    async init() {
        await fs.ensureDir(path.resolve(this.localStorageDir));
        // prepare structure
        await this._ensureStructure();
        process.env.APIFY_LOCAL_STORAGE_DIR = this.localStorageDir;
    }

    /**
     * Removes the folder itself
     * @return {Promise<void>}
     */
    async destroy() {
        fs.removeSync(this.localStorageDir);
        delete process.env.APIFY_LOCAL_STORAGE_DIR;
    }

    /**
     * Removes all files/folders form it
     * @return {Promise<void>}
     */
    async clean() {
        for (const folder of DEFAULT_FOLDERS) {
            await fs.emptyDirSync(path.join(this.localStorageDir, folder));
        }
    }

    async _ensureStructure() {
        // create first level
        for (const folder of DEFAULT_FOLDERS) {
            await fs.ensureDir(path.join(this.localStorageDir, folder));
        }
    }
}

export default LocalStorageDirEmulator;
