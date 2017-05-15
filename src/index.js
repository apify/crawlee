import { setPromisesDependency, getPromisesDependency } from './utils';
import { main, readyFreddy, getContext, getInput, setOutput, apifyClient } from './actor';

const Apifier = {
    main,
    getContext,
    getInput,
    setOutput,
    readyFreddy,
    setPromisesDependency,
    getPromisesDependency,
    client: apifyClient,
};

// export this way so that we can import using:
// const Apifier = require('apifier');
module.exports = Apifier;
