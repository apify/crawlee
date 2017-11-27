import BluebirdPromise from 'bluebird';
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import * as utils from '../build/utils';
import Apify from '../build/index';

/* global process, describe, it */

// TODO: run tests against build scripts too!

describe('Apify.xxxPromisesDependency()', () => {
    it('should throw on invalid args', () => {
        expect(() => { Apify.setPromisesDependency('test'); }).to.throw(Error);
        expect(() => { Apify.setPromisesDependency({}); }).to.throw(Error);
        expect(() => { Apify.setPromisesDependency(123); }).to.throw(Error);
        expect(() => { Apify.setPromisesDependency(); }).to.throw(Error);
        expect(() => { Apify.setPromisesDependency(undefined); }).to.throw(Error);
    });

    it('should work as expected', () => {
        Apify.setPromisesDependency(null);
        expect(Apify.getPromisesDependency()).to.be.a('null');
        expect(utils.newPromise()).to.have.property('then');

        // Check native promise
        Apify.setPromisesDependency(Promise);
        expect(Apify.getPromisesDependency()).to.equal(Promise);
        expect(utils.newPromise()).to.have.property('then');

        // Check bluebird
        Apify.setPromisesDependency(BluebirdPromise);
        expect(Apify.getPromisesDependency()).to.equal(BluebirdPromise);
        expect(utils.newPromise()).to.have.property('then');
    });
});

describe('utils.newClient()', () => {
    it('reads environment variables correctly', () => {
        process.env.APIFY_API_BASE_URL = 'http://www.example.com:1234/path/';
        process.env.APIFY_USER_ID = 'userId';
        process.env.APIFY_TOKEN = 'token';
        const client = utils.newClient();

        expect(client.constructor.name).to.eql('ApifyClient');
        const opts = client.getOptions();

        expect(opts.userId).to.eql('userId');
        expect(opts.token).to.eql('token');
        expect(opts.baseUrl).to.eql('http://www.example.com:1234/path/');
    });

    it('uses correct default if APIFY_API_BASE_URL is not defined', () => {
        delete process.env.APIFY_API_BASE_URL;
        process.env.APIFY_USER_ID = 'userId';
        process.env.APIFY_TOKEN = 'token';
        const client = utils.newClient();

        const opts = client.getOptions();

        expect(opts.userId).to.eql('userId');
        expect(opts.token).to.eql('token');
        expect(opts.baseUrl).to.eql('https://api.apify.com');
    });
});

describe('utils.addCharsetToContentType()', () => {
    it('works', () => {
        expect(utils.addCharsetToContentType('application/json; charset=something')).to.eql('application/json; charset=something');
        expect(utils.addCharsetToContentType('application/json; foo=bar; charset=something')).to.eql('application/json; foo=bar; charset=something');
        expect(utils.addCharsetToContentType('application/json; foo=bar')).to.eql('application/json; charset=utf-8; foo=bar');
        expect(utils.addCharsetToContentType('application/json')).to.eql('application/json; charset=utf-8');
        expect(utils.addCharsetToContentType(null)).to.eql(null);
        expect(utils.addCharsetToContentType(undefined)).to.eql(undefined);
    });
});

describe('utils.isDocker()', () => {
    it('works for dockerenv && cgroup', () => {
        sinon.stub(fs, 'stat').callsFake((path, callback) => callback(null));
        sinon.stub(fs, 'readFile').callsFake((path, encoding, callback) => callback(null, 'something ... docker ... something'));

        return utils
            .isDocker(true)
            .then((is) => {
                expect(is).to.be.eql(true);
                fs.stat.restore();
                fs.readFile.restore();
            });
    });

    it('works for dockerenv', () => {
        sinon.stub(fs, 'stat').callsFake((path, callback) => callback(null));
        sinon.stub(fs, 'readFile').callsFake((path, encoding, callback) => callback(null, 'something ... ... something'));

        return utils
            .isDocker(true)
            .then((is) => {
                expect(is).to.be.eql(true);
                fs.stat.restore();
                fs.readFile.restore();
            });
    });

    it('works for cgroup', () => {
        sinon.stub(fs, 'stat').callsFake((path, callback) => callback(new Error()));
        sinon.stub(fs, 'readFile').callsFake((path, encoding, callback) => callback(null, 'something ... docker ... something'));

        return utils
            .isDocker(true)
            .then((is) => {
                expect(is).to.be.eql(true);
                fs.stat.restore();
                fs.readFile.restore();
            });
    });

    it('works for nothing', () => {
        sinon.stub(fs, 'stat').callsFake((path, callback) => callback(new Error()));
        sinon.stub(fs, 'readFile').callsFake((path, encoding, callback) => callback(null, 'something ... ... something'));

        return utils
            .isDocker(true)
            .then((is) => {
                expect(is).to.be.eql(false);
                fs.stat.restore();
                fs.readFile.restore();
            });
    });
});
