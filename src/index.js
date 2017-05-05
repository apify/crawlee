import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, heyIAmReady } from './actor';
import { setDefaultToken, setDefaultUserId, getAllCrawlers, startCrawler } from './crawler';

const Apifier = {
    main,
    heyIAmReady,
    setPromisesDependency,
    getPromisesDependency,
    setDefaultToken,
    setDefaultUserId,
    getAllCrawlers,
    startCrawler,
};

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;
