import { Dataset, KeyValueStore } from 'crawlee';

const dataset = await Dataset.open<{ headingCount: number }>();

// calling map function and filtering through mapped items
const moreThan5headers = (await dataset.map((item) => item.headingCount)).filter((count) => count > 5);

// saving result of map to default Key-value store
await KeyValueStore.setValue('pages_with_more_than_5_headers', moreThan5headers);
