import BluebirdPromise from 'bluebird';
import { expect } from 'chai';
import * as utils from '../build/utils';
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


describe('utils.newClient', () => {
    it('reads environment variables correctly', () => {
        process.env.APIFY_API_BASE_URL = 'http://www.example.com:1234/path/';
        process.env.APIFY_USER_ID = 'userId';
        process.env.APIFY_TOKEN = 'token';
        const client = utils.newClient();

        expect(client.constructor.name).to.eql('ApifyClient');
        const opts = client.getOptions();

        // TODO: eventually this should be only:
        // expect(opts.baseUrl).to.eql('http://www.example.com:1234/path/');
        expect(opts.host).to.eql('www.example.com');
        expect(opts.port).to.eql(1234);
        expect(opts.basePath).to.eql('/path');
        expect(opts.userId).to.eql('userId');
        expect(opts.token).to.eql('token');
    });
});
