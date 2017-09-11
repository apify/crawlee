import _ from 'underscore';
import urlModule from 'url';
import BluebirdPromise from 'bluebird';
import { expect } from 'chai';
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
        expect(opts.baseUrl).to.eql('https://api.apifier.com');
    });
});


const testUrl = (url, extras) => {
    const parsed1 = utils.parseUrl(url);
    const parsed2 = urlModule.parse(url);
    expect(parsed1).to.eql(_.extend(parsed2, extras));
};

describe('utils.parseUrl()', () => {
    it('works', () => {
        testUrl('https://username:password@www.example.com:12345/some/path', {
            scheme: 'https',
            username: 'username',
            password: 'password',
        });

        testUrl('http://us-er+na12345me:@www.example.com:12345/some/path', {
            scheme: 'http',
            username: 'us-er+na12345me',
            password: '',
        });

        testUrl('socks5://username@www.example.com:12345/some/path', {
            scheme: 'socks5',
            username: 'username',
            password: null,
        });

        testUrl('FTP://@www.example.com:12345/some/path', {
            scheme: 'ftp',
            username: null,
            password: null,
        });

        testUrl('HTTP://www.example.com:12345/some/path', {
            scheme: 'http',
            username: null,
            password: null,
        });

        testUrl('www.example.com:12345/some/path', {
            scheme: null,
            username: null,
            password: null,
        });
    });
});


describe('utils.redactUrl()', () => {
    it('works', () => {
        expect(utils.redactUrl('https://username:password@www.example.com:1234/path#hash'))
            .to.eql('https://username:<redacted>@www.example.com:1234/path#hash');

        expect(utils.redactUrl('https://username@www.example.com:1234/path#hash'))
            .to.eql('https://username@www.example.com:1234/path#hash');

        expect(utils.redactUrl('https://username:password@www.example.com:1234/path#hash', '<xxx>'))
            .to.eql('https://username:<xxx>@www.example.com:1234/path#hash');

        expect(utils.redactUrl('ftp://@www.example.com/path/path2'))
            .to.eql('ftp://www.example.com/path/path2');

        expect(utils.redactUrl('ftp://www.example.com'))
            .to.eql('ftp://www.example.com/');

        expect(utils.redactUrl('ftp://example.com/'))
            .to.eql('ftp://example.com/');
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
