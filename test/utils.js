import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import * as utils from '../build/utils';
import Apify from '../build/index';

/* global process, describe, it */

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

describe('utils.getMemoryInfo()', () => {
    it('works outside the container', () => {
        const osMock = sinon.mock(os);
        const utilsMock = sinon.mock(utils);

        utilsMock
            .expects('isDocker')
            .once()
            .returns(Promise.resolve(false));

        osMock
            .expects('freemem')
            .once()
            .returns(222);

        osMock
            .expects('totalmem')
            .once()
            .returns(333);

        return Apify
            .getMemoryInfo()
            .then((data) => {
                expect(data).to.be.eql({
                    totalBytes: 333,
                    freeBytes: 222,
                    usedBytes: 111,
                });

                utilsMock.restore();
                osMock.restore();
            });
    });

    it('works inside the container', () => {
        const utilsMock = sinon.mock(utils);

        utilsMock
            .expects('isDocker')
            .once()
            .returns(Promise.resolve(true));

        sinon
            .stub(fs, 'readFile')
            .callsFake((path, callback) => {
                if (path === '/sys/fs/cgroup/memory/memory.limit_in_bytes') callback(null, '333');
                else if (path === '/sys/fs/cgroup/memory/memory.usage_in_bytes') callback(null, '111');
                else throw new Error('Invalid path');
            });

        return Apify
            .getMemoryInfo()
            .then((data) => {
                expect(data).to.be.eql({
                    totalBytes: 333,
                    freeBytes: 222,
                    usedBytes: 111,
                });

                utilsMock.restore();
                fs.readFile.restore();
            });
    });
});

describe('utils.isPromise()', () => {
    it('works', () => {
        const rejected = Promise.reject();

        expect(utils.isPromise(new Promise(resolve => setTimeout(resolve, 1000)))).to.be.eql(true);
        expect(utils.isPromise(Promise.resolve())).to.be.eql(true);
        expect(utils.isPromise(rejected)).to.be.eql(true);
        expect(utils.isPromise(new Date())).to.be.eql(false);
        expect(utils.isPromise(Function)).to.be.eql(false);
        expect(utils.isPromise(() => {})).to.be.eql(false);
        expect(utils.isPromise({ then: () => {} })).to.be.eql(false);

        rejected.catch(() => {});
    });
});

describe('utils.checkParamPrototypeOrThrow()', () => {
    it('works', () => {
        // One prototype
        expect(() => utils.checkParamPrototypeOrThrow(new Date(), 'param', Date, 'Date')).to.not.throw();
        expect(() => utils.checkParamPrototypeOrThrow(null, 'param', Function, 'Date', true)).to.not.throw();
        expect(() => utils.checkParamPrototypeOrThrow(undefined, 'param', Function, 'Date', true)).to.not.throw();
        expect(() => utils.checkParamPrototypeOrThrow(new Date(), 'param', Function, 'Date')).to.throw();

        // Multiple prototypes
        expect(() => utils.checkParamPrototypeOrThrow(new Date(), 'param', [Date, Function], 'Date')).to.not.throw();
        expect(() => utils.checkParamPrototypeOrThrow(new Date(), 'param', [Function, Date], 'Date')).to.not.throw();
        expect(() => utils.checkParamPrototypeOrThrow(new Date(), 'param', [Function, String], 'Date')).to.throw();
        expect(() => utils.checkParamPrototypeOrThrow(new Date(), 'param', [], 'Date')).to.throw();
    });
});

describe('utils.newPromise()', () => {
    it('works', () => {
        if (!utils.isPromise(utils.newPromise())) throw new Error('utils.newPromise() must return a promise!');
    });
});
