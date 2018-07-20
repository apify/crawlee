declare module "apify-client" {

    interface IApifyClientConstructor {
        (options?: IApifyClientConstructorOptions): IApifyClient;
        new(options?: IApifyClientConstructorOptions): IApifyClient;
    }

    interface IApifyClient {
        keyValueStores: {
            getOrCreateStore(options: { storeName: string }): Promise<IKeyValueStore>;
            getStore(options: { storeId: string }): Promise<IKeyValueStore>;
            getRecord(options: any): Promise<TKeyValueStoreRecord>;
            putRecord(options: any): Promise<any>;
            deleteRecord(options: any): Promise<any>;
            deleteStore(options: any): Promise<any>;
        }
    }

    export interface IApifyClientConstructorOptions {
        userId?: string;
        token?: string;
        promise?: any;
        expBackOffMillis?: number;
        expBackOffMaxRepeats?: number;
        baseUrl?: string;
    }

    export interface IKeyValueStore {
        id: string;
        userId: string;
        accessedAt: Date;
        createdAt: Date;
        modifiedAt: Date;
    }

    type TKeyValueStoreRecord = any;

    const ApifyClient: IApifyClientConstructor;
    export default ApifyClient;
}

