import { Dataset } from 'crawlee';

await Dataset.exportToValue('OUTPUT', { contentType: 'text/csv', keyValueStoreName: 'my-data' });