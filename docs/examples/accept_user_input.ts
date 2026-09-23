import { KeyValueStore } from 'crawlee';

const input = await KeyValueStore.getValue('INPUT');
console.log(input);
