import EventEmitter from 'events';

import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, readyFreddy, getContext, getInput, setOutput, apifyClient } from './actor';
import { browse } from './browser';

/* globals module */

// Publicly available functions
const Apifier = {
    main,
    getContext,
    getInput,
    setOutput,
    readyFreddy,
    setPromisesDependency,
    getPromisesDependency,
    browse,
    client: apifyClient,
    events: new EventEmitter(),
};

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;
