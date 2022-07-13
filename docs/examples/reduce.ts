import { Dataset, KeyValueStore } from 'crawlee';

const dataset = await Dataset.open();
const keyValueStore = await KeyValueStore.open();

// calling reduce function and using memo to calculate number of headers
const pagesHeadingCount = await dataset.reduce((memo, value) => {
    return memo + value.headingCount;
}, 0);

// saving result of map to default Key-value store
await keyValueStore.setValue('pages_heading_count', pagesHeadingCount);
