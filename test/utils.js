import BluebirdPromise from 'bluebird';
import { expect } from 'chai';
import * as utils from '../src/utils';
import Apifier from '../build/index';

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

        // Check native promise
        Apifier.setPromisesDependency(Promise);
        expect(Apifier.getPromisesDependency()).to.equal(Promise);
        expect(utils.newPromise()).to.have.property('then');

        // Check bluebird
        Apifier.setPromisesDependency(BluebirdPromise);
        expect(Apifier.getPromisesDependency()).to.equal(BluebirdPromise);
        expect(utils.newPromise()).to.have.property('then');
    });
});
