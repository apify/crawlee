import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, heyIAmReady } from './actor';

const Apifier = {
    main,
    heyIAmReady,
    setPromisesDependency,
    getPromisesDependency,
};

// export this way so the we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;
