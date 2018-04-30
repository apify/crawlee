import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import pidusage from 'pidusage';
import Promise from 'bluebird';
import * as utils from '../build/utils';
import Apify from '../build/index';
import { ENV_VARS } from '../build/constants';

chai.use(chaiAsPromised);

/* global process, describe, it */

describe('utils.newClient()', () => {
    it('reads environment variables correctly', () => {
        process.env[ENV_VARS.API_BASE_URL] = 'http://www.example.com:1234/path/';
        process.env[ENV_VARS.USER_ID] = 'userId';
        process.env[ENV_VARS.TOKEN] = 'token';
        const client = utils.newClient();

        expect(client.constructor.name).to.eql('ApifyClient');
        const opts = client.getOptions();

        expect(opts.userId).to.eql('userId');
        expect(opts.token).to.eql('token');
        expect(opts.baseUrl).to.eql('http://www.example.com:1234/path/');
    });

    it('uses correct default if APIFY_API_BASE_URL is not defined', () => {
        delete process.env[ENV_VARS.API_BASE_URL];
        process.env[ENV_VARS.USER_ID] = 'userId';
        process.env[ENV_VARS.TOKEN] = 'token';
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
    it('works WITHOUT child process outside the container', () => {
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
                    mainProcessBytes: 111,
                    childProcessesBytes: 0,
                });

                utilsMock.restore();
                osMock.restore();
            });
    });

    it('works WITHOUT child process inside the container', () => {
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
                    mainProcessBytes: 111,
                    childProcessesBytes: 0,
                });

                utilsMock.restore();
                fs.readFile.restore();
            });
    });

    it('works WITH child process outside the container', () => {
        const osMock = sinon.mock(os);
        const utilsMock = sinon.mock(utils);
        process.env[ENV_VARS.HEADLESS] = '1';

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

        return Apify.launchPuppeteer()
            .then((browser) => {
                return Apify
                    .getMemoryInfo()
                    .then((data) => {
                        expect(data.childProcessesBytes).to.be.above(0);
                        expect(data.usedBytes).to.be.above(0);
                        expect(data.mainProcessBytes).to.be.eql(data.usedBytes - data.childProcessesBytes);
                        utilsMock.restore();
                        osMock.restore();
                        delete process.env[ENV_VARS.HEADLESS];
                    })
                    .then(() => browser.close());
            });
    });

    it('works WITH child process inside the container', () => {
        const utilsMock = sinon.mock(utils);
        process.env[ENV_VARS.HEADLESS] = '1';

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

        return Apify.launchPuppeteer()
            .then((browser) => {
                return Apify
                    .getMemoryInfo()
                    .then((data) => {
                        expect(data.childProcessesBytes).to.be.above(0);
                        expect(data.usedBytes).to.be.above(0);
                        expect(data.mainProcessBytes).to.be.eql(data.usedBytes - data.childProcessesBytes);
                        utilsMock.restore();
                        fs.readFile.restore();
                        delete process.env[ENV_VARS.HEADLESS];
                    })
                    .then(() => browser.close());
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

describe('utils.newPromise()', () => {
    it('works', () => {
        if (!utils.isPromise(utils.newPromise())) throw new Error('utils.newPromise() must return a promise!');
    });
});

describe('utils.isAtHome()', () => {
    it('works', () => {
        expect(utils.isAtHome()).to.be.eql(false);
        process.env[ENV_VARS.IS_AT_HOME] = 1;
        expect(utils.isAtHome()).to.be.eql(true);
        delete process.env[ENV_VARS.IS_AT_HOME];
        expect(utils.isAtHome()).to.be.eql(false);
    });
});

describe('pidusage NPM package', () => {
    it('throws correct error message when process not found', () => {
        const NONEXISTING_PID = 9999;
        const promise = Promise.promisify(pidusage)(NONEXISTING_PID);

        return expect(promise).to.be.rejectedWith(utils.PID_USAGE_NOT_FOUND_ERROR);
    });
});

describe('utils.sum()', () => {
    it('works', () => {
        expect(utils.sum([1, 2, 3, 1.2])).to.be.eql(7.2);
        expect(utils.sum([])).to.be.eql(0);
        expect(utils.sum([9])).to.be.eql(9);
    });
});

describe('utils.avg()', () => {
    it('works', () => {
        expect(utils.avg([1, 2, 3, 1.2])).to.be.eql(7.2 / 4);
        expect(utils.avg([])).to.be.eql(NaN);
        expect(utils.avg([9])).to.be.eql(9);
    });
});
