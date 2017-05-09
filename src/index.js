import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, heyIAmReady } from './actor';
import openKeyValueStore from './key-value-store';


const Apifier = {
    main,
    heyIAmReady,
    setPromisesDependency,
    getPromisesDependency,
    openKeyValueStore,
};


// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;
