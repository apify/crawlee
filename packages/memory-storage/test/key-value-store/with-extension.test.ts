import { resolve } from 'node:path';

import { emptyDirSync, existsSync } from 'fs-extra';
import { createKeyValueStorageImplementation } from 'packages/memory-storage/src/fs/key-value-store';

describe('KeyValueStore should append extension only when needed', () => {
    const mockImageBuffer = Buffer.from('This is a test image', 'utf8');

    afterAll(() => emptyDirSync('tmp'));

    test('should append extension when needed (jpg)', async () => {
        const testDir = resolve('tmp', 'test_no_extension');
        const storage = createKeyValueStorageImplementation({
            persistStorage: true,
            storeDirectory: testDir,
            writeMetadata: true,
        });
        await storage.update({
            key: 'jibberish',
            value: mockImageBuffer,
            contentType: 'image/jpeg',
            extension: 'jpeg',
        });

        expect(existsSync(resolve(testDir, 'jibberish.jpeg'))).toBeTruthy();
        expect(existsSync(resolve(testDir, 'jibberish'))).toBeFalsy();
    });

    test('should append extension when needed (html)', async () => {
        const testDir = resolve('tmp', 'test_no_extension');
        const storage = createKeyValueStorageImplementation({
            persistStorage: true,
            storeDirectory: testDir,
            writeMetadata: true,
        });
        await storage.update({
            key: 'jibberish2',
            value: '<html lang="en"><body>Hi there!</body></html>',
            contentType: 'text/html',
            extension: 'html',
        });

        expect(existsSync(resolve(testDir, 'jibberish2.html'))).toBeTruthy();
        expect(existsSync(resolve(testDir, 'jibberish2'))).toBeFalsy();
    });

    test('should not append extension when already available', async () => {
        const testDir = resolve('tmp', 'test_extension');
        const storage = createKeyValueStorageImplementation({
            persistStorage: true,
            storeDirectory: testDir,
            writeMetadata: true,
        });
        await storage.update({
            key: 'jibberish.jpg',
            value: mockImageBuffer,
            contentType: 'image/jpeg',
            extension: 'jpeg',
        });

        expect(existsSync(resolve(testDir, 'jibberish.jpg'))).toBeTruthy();
        expect(existsSync(resolve(testDir, 'jibberish.jpg.jpeg'))).toBeFalsy();
    });

    test('should not append extension when already available', async () => {
        const testDir = resolve('tmp', 'test_extension');
        const storage = createKeyValueStorageImplementation({
            persistStorage: true,
            storeDirectory: testDir,
            writeMetadata: true,
        });
        await storage.update({
            key: 'jibberish2.html',
            value: '<html lang="en"><body>Hi there!</body></html>',
            contentType: 'text/html',
            extension: 'html',
        });

        expect(existsSync(resolve(testDir, 'jibberish2.html'))).toBeTruthy();
        expect(existsSync(resolve(testDir, 'jibberish2.html.html'))).toBeFalsy();
    });
});
