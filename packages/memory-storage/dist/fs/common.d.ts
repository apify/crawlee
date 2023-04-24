export interface StorageImplementation<T> {
    get(): Promise<T>;
    update(data: T): void | Promise<void>;
    delete(): void | Promise<void>;
}
//# sourceMappingURL=common.d.ts.map