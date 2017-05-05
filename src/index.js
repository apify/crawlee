import _ from 'underscore';
import Actor from './actor';
import Crawler from './crawler';


const Apifier = {};
_.extend(Apifier, Crawler, Actor);

// export this way so the we can import as:
// const Apifier = require('apifier');
module.exports = Apifier;
