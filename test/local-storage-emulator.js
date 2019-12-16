import { cryptoRandomObjectId } from 'apify-shared/utilities';
import fs from 'fs-extra';
import path from 'path';
import log from 'apify-shared/log';

import { LOCAL_STORAGE_DIR } from './_helper';

const DEFAULT_FOLDERS = ['datasets', 'key_value_stores/default', 'live_view', 'request_queues'];
class LocalStorageEmulator {
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
    async teardown() {
        fs.removeSync(this.localStorageDir);
    }

    /**
     * Removes all files/folders form it
     * @return {Promise<void>}
     */
    // Maybe empty?
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

export default LocalStorageEmulator;
