/// <reference types="node" />
import type * as storage from '@crawlee/types';
import type { Dictionary } from '@crawlee/types';
import type { MemoryStorage } from '../index';
import { BaseClient } from './common/base-client';
export interface DatasetClientOptions {
    id?: string;
    name?: string;
    baseStorageDirectory: string;
    client: MemoryStorage;
}
export declare class DatasetClient<Data extends Dictionary = Dictionary> extends BaseClient implements storage.DatasetClient<Data> {
    name?: string;
    createdAt: Date;
    accessedAt: Date;
    modifiedAt: Date;
    itemCount: number;
    datasetDirectory: string;
    private readonly datasetEntries;
    private readonly client;
    constructor(options: DatasetClientOptions);
    get(): Promise<storage.DatasetInfo | undefined>;
    update(newFields?: storage.DatasetClientUpdateOptions): Promise<storage.DatasetInfo>;
    delete(): Promise<void>;
    downloadItems(): Promise<Buffer>;
    listItems(options?: storage.DatasetClientListOptions): Promise<storage.PaginatedList<Data>>;
    pushItems(items: string | Data | string[] | Data[]): Promise<void>;
    toDatasetInfo(): storage.DatasetInfo;
    private generateLocalEntryName;
    private getStartAndEndIndexes;
    /**
     * To emulate API and split arrays of items into individual dataset items,
     * we need to normalize the input items - which can be strings, objects
     * or arrays of those - into objects, so that we can save them one by one
     * later. We could potentially do this directly with strings, but let's
     * not optimize prematurely.
     */
    private normalizeItems;
    private normalizeItem;
    private updateTimestamps;
}
//# sourceMappingURL=dataset.d.ts.map