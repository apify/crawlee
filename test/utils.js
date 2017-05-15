import sinon from 'sinon';
import request from 'request';
import { expect } from 'chai';
import * as utils from '../src/utils';

// NOTE: use require() here because this how its done in acts
const Apifier = process.env.TEST_BABEL_BUILD ? require('../build/index') : require('../src/index');

if (process.env.TEST_BABEL_BUILD) console.log('Running with TEST_BABEL_BUILD option');

/* global process */

// TODO: run tests against build scripts too!

describe('Apifier.xxxPromisesDependency()', () => {
    it('should throw on invalid args', () => {
        expect(() => { Apifier.setPromisesDependency('test'); }).to.throw(Error);
        expect(() => { Apifier.setPromisesDependency({}); }).to.throw(Error);
        expect(() => { Apifier.setPromisesDependency(123); }).to.throw(Error);
        expect(() => { Apifier.setPromisesDependency(); }).to.throw(Error);
        expect(() => { Apifier.setPromisesDependency(undefined); }).to.throw(Error);
    });

    it('should work as expected', () => {
        Apifier.setPromisesDependency(null);
        expect(Apifier.getPromisesDependency()).to.be.a('null');
        expect(utils.newPromise()).to.have.property('then');

        Apifier.setPromisesDependency(Promise);
        expect(Apifier.getPromisesDependency()).to.equal(Promise);
        expect(utils.newPromise()).to.have.property('then');
    });
});


// TODO: test nodeifyPromise() !!!

