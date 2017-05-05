import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, heyIAmReady } from './actor';
import {} from './crawler';

const Apifier = {
    main,
    heyIAmReady,
    setPromisesDependency,
    getPromisesDependency,
};

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;
