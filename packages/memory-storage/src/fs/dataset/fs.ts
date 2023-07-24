import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { AsyncQueue } from '@sapphire/async-queue';
import { ensureDir } from 'fs-extra';

import { lockAndWrite } from '../../background-handler/fs-utils';
import type { StorageImplementation } from '../common';

import type { CreateStorageImplementationOptions } from './index';

export class DatasetFileSystemEntry<Data> implements StorageImplementation<Data> {
    private filePath: string;
    private fsQueue = new AsyncQueue();

    constructor(options: CreateStorageImplementationOptions) {
        this.filePath = resolve(options.storeDirectory, `${options.entityId}.json`);
    }

    async get() {
        await this.fsQueue.wait();
        try {
            return JSON.parse(await readFile(this.filePath, 'utf-8'));
        } finally {
            this.fsQueue.shift();
        }
    }

    async update(data: Data) {
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
