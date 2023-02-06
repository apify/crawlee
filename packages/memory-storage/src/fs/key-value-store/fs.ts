import { ensureDir } from 'fs-extra';
import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { basename } from 'node:path/win32';
import type { CreateStorageImplementationOptions } from '.';
import type { InternalKeyRecord } from '../../resource-clients/key-value-store';
import { memoryStorageLog } from '../../utils';
import { lockAndWrite } from '../../workers/worker-utils';
import type { StorageImplementation } from '../common';

export class KeyValueFileSystemEntry implements StorageImplementation<InternalKeyRecord> {
    private storeDirectory: string;
    private writeMetadata: boolean;

    private filePath!: string;
    private fileMetadataPath!: string;
    private rawRecord!: Omit<InternalKeyRecord, 'value'>;

    constructor(options: CreateStorageImplementationOptions) {
        this.storeDirectory = options.storeDirectory;
        this.writeMetadata = options.writeMetadata;
    }

    async get(): Promise<InternalKeyRecord> {
        let file: Buffer | string;

        try {
            file = await readFile(this.filePath);
        } catch {
            try {
                // Try without extension
                file = await readFile(resolve(this.storeDirectory, this.rawRecord.key));
                memoryStorageLog.warning([
                    `Key-value entry "${this.rawRecord.key}" for store ${basename(this.storeDirectory)} does not have a file extension, assuming it as text.`,
                    'If you want to have correct interpretation of the file, you should add a file extension to the entry.',
                ].join('\n'));
                file = file.toString('utf-8');
            } catch {
                // This is impossible to happen, but just in case
                throw new Error(`Could not find file at ${this.filePath}`);
            }
        }

        return {
            ...this.rawRecord,
            value: file,
        };
    }

    async update(data: InternalKeyRecord) {
        this.filePath ??= resolve(this.storeDirectory, `${data.key}.${data.extension}`);
        this.fileMetadataPath ??= resolve(this.storeDirectory, `${data.key}.__metadata__.json`);

        const { value, ...rest } = data;
        this.rawRecord = rest;

        await ensureDir(dirname(this.filePath));
        await lockAndWrite(this.filePath, value, false);

        if (this.writeMetadata) {
            await lockAndWrite(this.fileMetadataPath, JSON.stringify(rest), true);
        }
    }

    async delete() {
        await rm(this.filePath, { force: true });
        await rm(this.fileMetadataPath, { force: true });
    }
}
