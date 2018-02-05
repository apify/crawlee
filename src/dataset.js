import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import Promise from 'bluebird';
import { leftpad } from 'apify-shared/utilities';
import LruCache from 'apify-shared/lru_cache';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { ENV_VARS } from './constants';
import { apifyClient } from './utils';

export const LEFTPAD_COUNT = 9; // Used for filename in DatasetLocal.
export const MAX_OPENED_STORES = 1000;

const writeFilePromised = Promise.promisify(fs.writeFile);
const mkdirPromised = Promise.promisify(fs.mkdir);
const readdirPromised = Promise.promisify(fs.readdir);

const { datasets } = apifyClient;
const datasetsCache = new LruCache({ maxLength: MAX_OPENED_STORES }); // Open Datasets are stored here.

/**
 * @class Dataset
 * @param {String} datasetId - ID of the dataset.

 * @description
 * <p>Dataset class provides easy interface to Apify Dataset storage type. Dataset should be opened using
 * `Apify.openDataset()` function.</p>
 * <p>Basic usage of Dataset:</p>
 * ```javascript
 * const dataset = await Apify.openDataset(data);
 * await dataset.pushData({ foo: 'bar' });
 * ```
 */
export class Dataset {
    constructor(datasetId) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');

        this.datasetId = datasetId;
    }

    /**
     * Stores object or an array of objects in the dataset.
     * The function has no result, but throws on invalid args or other errors.
     * @memberof Dataset
     * @method pushData
     * @return {Promise}
     */
    pushData(data) {
        checkParamOrThrow(data, 'data', 'Array | Object');

        return datasets.putItems({
            datasetId: this.datasetId,
            data,
        });
    }
}

/**
 * This is a local representation of a dataset.
 * @ignore
 */
export class DatasetLocal {
    constructor(datasetId, localEmulationDir) {
        checkParamOrThrow(datasetId, 'datasetId', 'String');
        checkParamOrThrow(localEmulationDir, 'localEmulationDir', 'String');

        this.localEmulationPath = path.resolve(path.join(localEmulationDir, datasetId));
        this.counter = 0;
        this.datasetId = datasetId;
        this.initializationPromise = this._initialize();
    }

    _initialize() {
        return mkdirPromised(this.localEmulationPath)
            .catch((err) => {
                if (err.code !== 'EEXIST') throw err;
            })
            .then(() => readdirPromised(this.localEmulationPath))
            .then((files) => {
                if (files.length) {
                    const lastFileNum = files.pop().split('.')[0];

                    this.counter = parseInt(lastFileNum, 10);
                }
            });
    }

    pushData(data) {
        checkParamOrThrow(data, 'data', 'Array | Object');

        if (!_.isArray(data)) data = [data];

        return this.initializationPromise
            .then(() => {
                const promises = data.map((item) => {
                    this.counter++;

                    // Format JSON to simplify debugging, the overheads is negligible
                    const itemStr = JSON.stringify(item, null, 2);
                    const fileName = `${leftpad(this.counter, LEFTPAD_COUNT, 0)}.json`;
                    const filePath = path.join(this.localEmulationPath, fileName);

                    return writeFilePromised(filePath, itemStr);
                });

                return Promise.all(promises);
            });
    }
}

/**
 * Helper function that first requests dataset by ID and if dataset doesn't exist
 * then tries to get him by name.
 * @ignore
 */
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
 * @description <p>Opens dataset and returns its object.</p>
 * ```javascript
 * const dataset = await Apify.openDataset(data);
 * await dataset.pushData({ foo: 'bar' });
 * ```
 * @param {string} datasetIdOrName ID or name of the dataset to be opened.
 * @returns {Promise<Dataset>} Returns a promise that resolves to a Dataset object.
 */
export const openDataset = (datasetIdOrName) => {
    checkParamOrThrow(datasetIdOrName, 'datasetIdOrName', 'Maybe String');

    const localEmulationDir = process.env[ENV_VARS.LOCAL_EMULATION_DIR];

    let datasetPromise = datasetIdOrName
        ? datasetsCache.get(datasetIdOrName)
        : null;

    // Should we use the default dataset?
    if (!datasetIdOrName) {
        datasetIdOrName = process.env[ENV_VARS.DEFAULT_DATASET_ID];

        // Env var doesn't exist.
        if (!datasetIdOrName) {
            const error = new Error(`The '${ENV_VARS.DEFAULT_DATASET_ID}' environment variable is not defined.`);

            return Promise.reject(error);
        }

        datasetPromise = datasetsCache.get(datasetIdOrName);

        // It's not initialized yet.
        if (!datasetPromise) {
            datasetPromise = localEmulationDir
                ? Promise.resolve(new DatasetLocal(datasetIdOrName, localEmulationDir))
                : Promise.resolve(new Dataset(datasetIdOrName));

            datasetsCache.add(datasetIdOrName, datasetPromise);
        }
    }

    // Need to be initialized.
    if (!datasetPromise) {
        datasetPromise = localEmulationDir
            ? Promise.resolve(new DatasetLocal(datasetIdOrName, localEmulationDir))
            : getOrCreateDataset(datasetIdOrName).then(dataset => (new Dataset(dataset.id)));

        datasetsCache.add(datasetIdOrName, datasetPromise);
    }

    return datasetPromise;
};

/**
 * @memberof module:Apify
 * @function
 * @description <p>Stores object or an array of objects in the default dataset for the current act run using the Apify API
 * Default id of the store is in the `APIFY_DEFAULT_DATASET_ID` environment variable
 * The function has no result, but throws on invalid args or other errors.</p>
 * ```javascript
 * await Apify.pushData(data);
 * ```
 * <p>
 * The data is stored in default dataset associated with this act.
 * </p>
 * <p>
 * **IMPORTANT: Do not forget to use the `await` keyword when calling `Apify.pushData()`,
 * otherwise the act process might finish before the data is stored!**
 * </p>
 * @param {Object|Array} data Object or array of objects containing data to by stored in the dataset
 * @returns {Promise} Returns a promise that gets resolved once data are saved.
 */
export const pushData = item => openDataset().then(dataset => dataset.pushData(item));
