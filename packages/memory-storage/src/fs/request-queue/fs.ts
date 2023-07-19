import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { AsyncQueue } from '@sapphire/async-queue';
import { ensureDir } from 'fs-extra';

import type { InternalRequest } from '../../resource-clients/request-queue';
import { lockAndWrite } from '../../workers/worker-utils';
import type { StorageImplementation } from '../common';

import type { CreateStorageImplementationOptions } from '.';

export class RequestQueueFileSystemEntry implements StorageImplementation<InternalRequest> {
    private filePath: string;
    private fsQueue = new AsyncQueue();
    private data?: InternalRequest;

    /**
     * A "sweep" timeout that is created/refreshed whenever this entry is accessed/updated.
     * It exists to ensure that the entry is not kept in memory indefinitely, by sweeping it after 60 seconds of inactivity (in order to keep memory usage low)
     */
    private sweepTimeout?: NodeJS.Timeout;

    constructor(options: CreateStorageImplementationOptions) {
        this.filePath = resolve(options.storeDirectory, `${options.requestId}.json`);
    }

    async get() {
        await this.fsQueue.wait();
        this.setOrRefreshSweepTimeout();

        if (this.data) {
            this.fsQueue.shift();
            return this.data;
        }

        try {
            const req = JSON.parse(await readFile(this.filePath, 'utf-8'));
            this.data = req;

            return req;
        } finally {
            this.fsQueue.shift();
        }
    }

    async update(data: InternalRequest) {
        await this.fsQueue.wait();
        this.data = data;

        try {
            await ensureDir(dirname(this.filePath));
            await lockAndWrite(this.filePath, data);
        } finally {
            this.setOrRefreshSweepTimeout();
            this.fsQueue.shift();
        }
    }

    async delete() {
        await this.fsQueue.wait();
        await rm(this.filePath, { force: true });
        this.fsQueue.shift();
    }

    private setOrRefreshSweepTimeout() {
        if (this.sweepTimeout) {
            this.sweepTimeout.refresh();
        } else {
            this.sweepTimeout = setTimeout(() => {
                this.sweepTimeout = undefined;
                this.data = undefined;
            }, 60_000).unref();
        }
    }
}
