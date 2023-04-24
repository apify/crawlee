"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueueCollectionClient = void 0;
const shapeshift_1 = require("@sapphire/shapeshift");
const node_path_1 = require("node:path");
const cache_helpers_1 = require("../cache-helpers");
const instance_1 = require("../workers/instance");
const request_queue_1 = require("./request-queue");
class RequestQueueCollectionClient {
    constructor({ baseStorageDirectory, client }) {
        Object.defineProperty(this, "requestQueuesDirectory", {
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
        this.requestQueuesDirectory = (0, node_path_1.resolve)(baseStorageDirectory);
        this.client = client;
    }
    async list() {
        return {
            total: this.client.requestQueuesHandled.length,
            count: this.client.requestQueuesHandled.length,
            offset: 0,
            limit: this.client.requestQueuesHandled.length,
            desc: false,
            items: this.client.requestQueuesHandled.map((store) => store.toRequestQueueInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }
    async getOrCreate(name) {
        shapeshift_1.s.string.optional.parse(name);
        if (name) {
            const found = await (0, cache_helpers_1.findRequestQueueByPossibleId)(this.client, name);
            if (found) {
                return found.toRequestQueueInfo();
            }
        }
        const newStore = new request_queue_1.RequestQueueClient({ name, baseStorageDirectory: this.requestQueuesDirectory, client: this.client });
        this.client.requestQueuesHandled.push(newStore);
        // Schedule the worker to write to the disk
        const queueInfo = newStore.toRequestQueueInfo();
        // eslint-disable-next-line dot-notation
        (0, instance_1.sendWorkerMessage)({
            action: 'update-metadata',
            entityType: 'requestQueues',
            entityDirectory: newStore.requestQueueDirectory,
            id: queueInfo.name ?? queueInfo.id,
            data: queueInfo,
            writeMetadata: this.client.writeMetadata,
            persistStorage: this.client.persistStorage,
        });
        return queueInfo;
    }
}
exports.RequestQueueCollectionClient = RequestQueueCollectionClient;
//# sourceMappingURL=request-queue-collection.js.map