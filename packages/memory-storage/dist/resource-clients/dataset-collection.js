"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatasetCollectionClient = void 0;
const shapeshift_1 = require("@sapphire/shapeshift");
const path_1 = require("path");
const cache_helpers_1 = require("../cache-helpers");
const instance_1 = require("../workers/instance");
const dataset_1 = require("./dataset");
class DatasetCollectionClient {
    constructor({ baseStorageDirectory, client }) {
        Object.defineProperty(this, "datasetsDirectory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "client", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.datasetsDirectory = (0, path_1.resolve)(baseStorageDirectory);
        this.client = client;
    }
    async list() {
        return {
            total: this.client.datasetClientsHandled.length,
            count: this.client.datasetClientsHandled.length,
            offset: 0,
            limit: this.client.datasetClientsHandled.length,
            desc: false,
            items: this.client.datasetClientsHandled.map((store) => store.toDatasetInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }
    async getOrCreate(name) {
        shapeshift_1.s.string.optional.parse(name);
        if (name) {
            const found = await (0, cache_helpers_1.findOrCacheDatasetByPossibleId)(this.client, name);
            if (found) {
                return found.toDatasetInfo();
            }
        }
        const newStore = new dataset_1.DatasetClient({ name, baseStorageDirectory: this.datasetsDirectory, client: this.client });
        this.client.datasetClientsHandled.push(newStore);
        // Schedule the worker to write to the disk
        const datasetInfo = newStore.toDatasetInfo();
        // eslint-disable-next-line dot-notation
        (0, instance_1.sendWorkerMessage)({
            action: 'update-metadata',
            entityType: 'datasets',
            entityDirectory: newStore.datasetDirectory,
            id: datasetInfo.name ?? datasetInfo.id,
            data: datasetInfo,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
        return datasetInfo;
    }
}
exports.DatasetCollectionClient = DatasetCollectionClient;
//# sourceMappingURL=dataset-collection.js.map