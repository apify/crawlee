import { initialize, expect, getActorTestDir, runActor, getKeyValueStoreItems } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

await runActor(testActorDirname);

const kvsItems = await getKeyValueStoreItems(testActorDirname, 'test');

expect(kvsItems.length === 1, 'Key-value store automatically saved the value expected to be auto-saved');

const [{ name, raw }] = kvsItems;

expect(name === 'crawlee', 'Key-value store auto-saved value is named "crawlee"');

const parsed = JSON.parse(raw.toString());

expect(typeof parsed === 'object' && parsed !== null, 'Key-value store auto-save value is a non-nullable object');
expect(parsed.crawlee === 'awesome!', 'Key-value store auto-save value has a property "crawlee" that is set to "awesome!"');
