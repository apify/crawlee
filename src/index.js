<<<<<<< HEAD
import _ from 'underscore';
import Actor from './actor';
import Crawler from './crawler';
=======
import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, heyIAmReady } from './actor';
>>>>>>> master

const Apifier = {
    main,
    heyIAmReady,
    setPromisesDependency,
    getPromisesDependency,
};

<<<<<<< HEAD
const Apifier = {};
_.extend(Apifier, Crawler, Actor);
=======
>>>>>>> master

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;
