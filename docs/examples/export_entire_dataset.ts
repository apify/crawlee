import { Dataset } from 'crawlee';

// Retrieve or generate two items to be pushed
const data = [
    {
        id: 123,
        name: 'foo',
    },
    {
        id: 456,
        name: 'bar'
    },
];

// Push the two items to the default dataset
await Dataset.pushData(data);

// Export the entirety of the dataset to a single file in
// a key-value store named "my-data" under the key "OUTPUT"
await Dataset.exportToValue('OUTPUT', { contentType: 'text/csv', keyValueStoreName: 'my-data' });
