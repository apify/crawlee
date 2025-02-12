import { initialize, expect, getActorTestDir, runActor } from '../tools.mjs';

/* This test verifies that the storageObject is correctly returned when the KeyValueStore is opened.
 * The storageObject is the result of the KeyValueStoreClient.get() method,
 * containing properties such as name, id, and other custom attributes.
 */

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { defaultKeyValueStoreItems: items } = await runActor(testActorDirname);

await expect(items !== undefined, 'Key value store exists');

const item = items.find((kvItem) => kvItem.name === 'storageObject');

const parsed = JSON.parse(item.raw.toString());

await expect(
    typeof parsed === 'object' && parsed !== null,
    'Key-value contains key "storeObject" and it\'s value is a non-nullable object',
);
await expect(parsed.id !== null, 'storeObject contains id');
await expect(parsed.name !== null, 'storeObject contains name');
await expect(parsed.userId !== null, 'storeObject contains userId');
