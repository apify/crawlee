"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
// Retrieve or generate two items to be pushed
const data = [
    {
        id: 123,
        name: 'foo',
    },
    {
        id: 456,
        name: 'bar',
    },
];
// Push the two items to the default dataset
await crawlee_1.Dataset.pushData(data);
// Export the entirety of the dataset to a single file in
// the default key-value store under the key "OUTPUT"
await crawlee_1.Dataset.exportToCSV('OUTPUT');
