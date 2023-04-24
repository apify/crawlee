import type { StorageTypes } from '../../consts';
export declare class BaseClient {
    id: string;
    constructor(id: string);
    protected throwOnNonExisting(clientType: StorageTypes): never;
    protected throwOnDuplicateEntry(clientType: StorageTypes, keyName: string, value: string): never;
}
//# sourceMappingURL=base-client.d.ts.map