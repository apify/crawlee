import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CheerioCrawler, FileSystemStorageBackend } from 'crawlee';
import type { KeyValueStoreBackend, StorageIdentifier } from '@crawlee/types';

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

class EncryptingStorageBackend extends FileSystemStorageBackend {
    override async createKeyValueStoreBackend(options?: StorageIdentifier): Promise<KeyValueStoreBackend> {
        const store = await super.createKeyValueStoreBackend(options);
        const { getValue, setValue } = Object.getPrototypeOf(store) as KeyValueStoreBackend;

        // Patching the instance keeps the example short; a real implementation would wrap the backend in a class of its own.
        store.getValue = async (key) => {
            const record = await getValue.call(store, key);
            return record && { ...record, value: decrypt(new Uint8Array(record.value)) };
        };
        store.setValue = async (record) => {
            // `Response` drains every input shape a backend can receive, streams included.
            const plain = Buffer.from(await new Response(record.value as BodyInit).arrayBuffer());
            await setValue.call(store, { ...record, value: encrypt(plain) });
        };
        return store;
    }
}

const crawler = new CheerioCrawler({
    storageBackend: new EncryptingStorageBackend({ localDataDirectory: './storage' }),
    async requestHandler({ request, $, useState, getKeyValueStore }) {
        const state = await useState({ visited: 0 });
        state.visited++;
        const store = await getKeyValueStore();
        await store.setValue(request.id, { url: request.url, title: $('title').text() });
    },
});

await crawler.run(['https://crawlee.dev']);
