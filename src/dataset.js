import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import Promise from 'bluebird';
import { leftpad } from 'apify-shared/utilities';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS } from './constants';
import { apifyClient } from './utils';

const writeFilePromised = Promise.promisify(fs.writeFile);
const { datasets } = apifyClient;
const datasetsCache = {}; // Open Datasets are stored here.
export const LEFTPAD_COUNT = 9; // Used for filename in DatasetLocal.

const isStringableOrThrow = (data) => {
    let stringifiedRecord;
    try {
        // Format JSON to simplify debugging, the overheads with compression is negligible
        stringifiedRecord = JSON.stringify(data, null, 2);
    } catch (e) {
        throw new Error(`The "data" parameter cannot be stringified to JSON: ${e.message}`);
    }
    if (stringifiedRecord === undefined) {
        throw new Error('The "data" parameter cannot be stringified to JSON.');
    }
};

export class DatasetRemote {
    constructor(datasetId) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');

        this.datasetId = datasetId;
    }

    pushData(data) {
        checkParamOrThrow(data, 'data', 'Array | Object');
        isStringableOrThrow(data);

        return datasets.putItem({
            datasetId: this.datasetId,
            data,
        });
    }
}

export class DatasetLocal {
    constructor(datasetId, localEmulationDir) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.localEmulationPath = path.resolve(path.join(localEmulationDir, datasetId));
        this.counter = 0;
        this.datasetId = datasetId;

        if (!fs.existsSync(this.localEmulationPath)) fs.mkdirSync(this.localEmulationPath);

        const files = fs.readdirSync(this.localEmulationPath);

        if (files.length) {
            const lastFileNum = files.pop().split('.')[0];

            this.counter = parseInt(lastFileNum, 10);
        }
    }

    pushData(data) {
        checkParamOrThrow(data, 'data', 'Array | Object');
        isStringableOrThrow(data);

        if (!_.isArray(data)) data = [data];

        const promises = data.map((item) => {
            this.counter++;

            const itemStr = JSON.stringify(item, null, 2);
            const fileName = `${leftpad(this.counter, LEFTPAD_COUNT, 0)}.json`;
            const filePath = path.join(this.localEmulationPath, fileName);

            return writeFilePromised(filePath, itemStr);
        });

        return Promise.all(promises);
    }
}

const getOrCreateDataset = (datasetIdOrName) => {
    return apifyClient
        .datasets
        .getDataset({ datasetId: datasetIdOrName })
        .then((existingDataset) => {
            if (existingDataset) return existingDataset;

            return apifyClient
                .datasets
                .getOrCreateDataset({ datasetName: datasetIdOrName });
        });
};

/**
 * @memberof module:Apify
 * @function
 *
 * @TODO
 */
export const openDataset = (datasetIdOrName) => {
    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    checkParamOrThrow(datasetIdOrName, 'datasetIdOrName', 'Maybe String');

    // Use default key-value dataset.
    if (!datasetIdOrName) {
        datasetIdOrName = process.env[ENV_VARS.DEFAULT_DATASET_ID];

        // Env vars doesn't exist.
        if (!datasetIdOrName) {
            const error = new Error(`The '${ENV_VARS.DEFAULT_DATASET_ID}' environment variable is not defined.`);

            return Promise.reject(error);
        }

        // It's not initialized yet.
        if (!datasetsCache[datasetIdOrName]) {
            datasetsCache[datasetIdOrName] = localEmulationDir
                ? Promise.resolve(new DatasetLocal(datasetIdOrName, localEmulationDir))
                : Promise.resolve(new DatasetRemote(datasetIdOrName));
        }
    }

    // Need to be intialized.
    if (!datasetsCache[datasetIdOrName]) {
        datasetsCache[datasetIdOrName] = localEmulationDir
            ? Promise.resolve(new DatasetLocal(datasetIdOrName, localEmulationDir))
            : getOrCreateDataset(datasetIdOrName).then(dataset => (new DatasetRemote(dataset.id)));
    }

    return datasetsCache[datasetIdOrName];
};

/**
 * @ignore
 * @memberof module:Apify
 * @function
 * @description <p>Stores a record (object) in a sequential store using the Apify API.
 * If this is first write then a new store is created and associated with this act and then this and all further call
 * are stored in it. Default id of the store is in the `APIFY_DEFAULT_SEQUENTIAL_STORE_ID` environment variable;
 * The function has no result, but throws on invalid args or other errors.</p>
 * <pre><code class="language-javascript">await Apify.pushRecord(record);</code></pre>
 * <p>
 * By default, the record is stored as is in default sequential store associated with this act.
 * <p>
 * **IMPORTANT: Do not forget to use the `await` keyword when calling `Apify.pushRecord()`,
 * otherwise the act process might finish before the record is stored!**
 * </p>
 * @param {Object} record Object containing date to by stored in the store
 * @returns {Promise} Returns a promise.
 *
 * @TODO: update to dataset
 */
export const pushData = item => openDataset().then(dataset => dataset.pushData(item));
