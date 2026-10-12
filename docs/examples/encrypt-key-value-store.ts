import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CheerioCrawler, FileSystemStorageBackend } from 'crawlee';
import type { KeyValueStoreBackend, StorageBackend, StorageIdentifier } from '@crawlee/types';

const secret = randomBytes(32); // load it from somewhere safe instead

function encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', secret, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt(sealed: Uint8Array): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', secret, sealed.subarray(0, 12));
    decipher.setAuthTag(sealed.subarray(12, 28));
    return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

class EncryptingStorageBackend implements StorageBackend {
    readonly #inner: StorageBackend;
    constructor(inner: StorageBackend) {
        this.#inner = inner;
    }

    createDatasetBackend = (options?: StorageIdentifier) => this.#inner.createDatasetBackend(options);
    createRequestQueueBackend = (options?: StorageIdentifier) => this.#inner.createRequestQueueBackend(options);
    storageExists = async (id: string, type: 'Dataset' | 'KeyValueStore' | 'RequestQueue') =>
        (await this.#inner.storageExists?.(id, type)) ?? false;
    purge = async () => this.#inner.purge?.();
    // Must differ from the inner backend's key, or the two would share cached `KeyValueStore` instances.
    getStorageBackendCacheKey = () =>
        `encrypted:${this.#inner.getStorageBackendCacheKey?.() ?? this.#inner.constructor.name}`;

    async createKeyValueStoreBackend(options?: StorageIdentifier): Promise<KeyValueStoreBackend> {
        const inner = await this.#inner.createKeyValueStoreBackend(options);
        return {
            getMetadata: () => inner.getMetadata(),
            drop: () => inner.drop(),
            purge: () => inner.purge(),
            deleteValue: (key) => inner.deleteValue(key),
            listKeys: (listOptions) => inner.listKeys(listOptions),
            getPublicUrl: (key) => inner.getPublicUrl(key),
            recordExists: (key) => inner.recordExists(key),
            async getValue(key) {
                const record = await inner.getValue(key);
                return record && { ...record, value: decrypt(new Uint8Array(record.value)) };
            },
            async setValue(record) {
                // `Response` drains every input shape a backend can receive, streams included.
                const plain = Buffer.from(await new Response(record.value as BodyInit).arrayBuffer());
                await inner.setValue({ ...record, value: encrypt(plain) });
            },
        };
    }
}

const crawler = new CheerioCrawler({
    storageBackend: new EncryptingStorageBackend(new FileSystemStorageBackend({ localDataDirectory: './storage' })),
    async requestHandler({ request, $, useState, getKeyValueStore }) {
        const state = await useState({ visited: 0 });
        state.visited++;
        const store = await getKeyValueStore();
        await store.setValue(request.id, { url: request.url, title: $('title').text() });
    },
});

await crawler.run(['https://crawlee.dev']);
