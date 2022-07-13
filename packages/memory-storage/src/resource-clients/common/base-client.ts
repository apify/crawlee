import type { StorageTypes } from '../../consts';

export class BaseClient {
    id: string;

    constructor(id: string) {
        this.id = id;
    }

    protected throwOnNonExisting(clientType: StorageTypes): never {
        throw new Error(`${clientType} with id: ${this.id} does not exist.`);
    }

    protected throwOnDuplicateEntry(clientType: StorageTypes, keyName: string, value: string): never {
        throw new Error(`${clientType} with ${keyName}: ${value} already exists.`);
    }
}
