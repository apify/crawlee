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

// Calling map function and filtering through mapped items...
const moreThan5headers = (await dataset.map((item) => item.headingCount)).filter((count) => count > 5);

// Saving the result of map to default key-value store...
await KeyValueStore.setValue('pages_with_more_than_5_headers', moreThan5headers);
