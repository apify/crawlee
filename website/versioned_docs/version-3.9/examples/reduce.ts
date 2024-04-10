import { Dataset, KeyValueStore } from 'crawlee';

const dataset = await Dataset.open<{
    url: string,
    headingCount: number,
}>();

// Seeding the dataset with some data
await dataset.pushData([
    {
        url: 'https://crawlee.dev/',
        headingCount: 11,
    },
    {
        url: 'https://crawlee.dev/storage',
        headingCount: 8,
    },
    {
        url: 'https://crawlee.dev/proxy',
        headingCount: 4,
    },
]);

// calling reduce function and using memo to calculate number of headers
const pagesHeadingCount = await dataset.reduce((memo, value) => {
    return memo + value.headingCount;
}, 0);

// saving result of map to default Key-value store
await KeyValueStore.setValue('pages_heading_count', pagesHeadingCount);
