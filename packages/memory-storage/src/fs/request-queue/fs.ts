import { AsyncQueue } from '@sapphire/async-queue';
import { ensureDir } from 'fs-extra';
import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CreateStorageImplementationOptions } from '.';
import type { InternalRequest } from '../../resource-clients/request-queue';
import { lockAndWrite } from '../../workers/worker-utils';
import type { StorageImplementation } from '../common';

export class RequestQueueFileSystemEntry implements StorageImplementation<InternalRequest> {
    private filePath: string;
    private fsQueue = new AsyncQueue();

    constructor(options: CreateStorageImplementationOptions) {
        this.filePath = resolve(options.storeDirectory, `${options.requestId}.json`);
    }

    async get() {
        await this.fsQueue.wait();
        try {
            return JSON.parse(await readFile(this.filePath, 'utf-8'));
        } finally {
            this.fsQueue.shift();
        }
    }

    async update(data: InternalRequest) {
        await this.fsQueue.wait();
        try {
            await ensureDir(dirname(this.filePath));
            await lockAndWrite(this.filePath, data);
        } finally {
            this.fsQueue.shift();
        }
    }

    async delete() {
        await this.fsQueue.wait();
        await rm(this.filePath, { force: true });
        this.fsQueue.shift();
    }
}
