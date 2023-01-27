import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ensureDir } from 'fs-extra';
import type { CreateStorageImplementationOptions } from './index';
import type { StorageImplementation } from '../common';
import { lockAndWrite } from '../../workers/worker-utils';

export class DatasetFileSystemEntry<Data> implements StorageImplementation<Data> {
    private filePath: string;

    constructor(options: CreateStorageImplementationOptions) {
        this.filePath = resolve(options.storeDirectory, `${options.entityId}.json`);
    }

    async get() {
        return JSON.parse(await readFile(this.filePath, 'utf-8'));
    }

    async update(data: Data) {
        await ensureDir(dirname(this.filePath));
        await lockAndWrite(this.filePath, data);
    }

    async delete() {
        await rm(this.filePath, { force: true });
    }
}
