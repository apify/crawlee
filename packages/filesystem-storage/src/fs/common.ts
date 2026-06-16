export interface StorageImplementation<T> {
    get(force?: boolean): Promise<T>;
    update(data: T): void | Promise<void>;
    delete(): void | Promise<void>;
}
