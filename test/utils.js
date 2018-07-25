import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import os from 'os';
import pidusage from 'pidusage';
import Promise from 'bluebird';
import requestPromise from 'request-promise';
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

describe('utils.isProduction()', () => {
    it('works', () => {
        const prev = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';
            expect(utils.isProduction()).to.eql(true);

            process.env.NODE_ENV = 'debug';
            expect(utils.isProduction()).to.eql(false);
        } finally {
            process.env.NODE_ENV = prev;
        }
    });
});

describe('utils.isDocker()', () => {
    it('works for dockerenv && cgroup', () => {
        sinon.stub(fs, 'stat').callsFake((filePath, callback) => callback(null));
        sinon.stub(fs, 'readFile').callsFake((filePath, encoding, callback) => callback(null, 'something ... docker ... something'));

        return utils
            .isDocker(true)
            .then((is) => {
                expect(is).to.be.eql(true);
                fs.stat.restore();
                fs.readFile.restore();
            });
    });

    it('works for dockerenv', () => {
        sinon.stub(fs, 'stat').callsFake((filePath, callback) => callback(null));
        sinon.stub(fs, 'readFile').callsFake((filePath, encoding, callback) => callback(null, 'something ... ... something'));

        return utils
            .isDocker(true)
            .then((is) => {
                expect(is).to.be.eql(true);
                fs.stat.restore();
                fs.readFile.restore();
            });
    });

    it('works for cgroup', () => {
        sinon.stub(fs, 'stat').callsFake((filePath, callback) => callback(new Error()));
        sinon.stub(fs, 'readFile').callsFake((filePath, encoding, callback) => callback(null, 'something ... docker ... something'));

        return utils
            .isDocker(true)
            .then((is) => {
                expect(is).to.be.eql(true);
                fs.stat.restore();
                fs.readFile.restore();
            });
    });

    it('works for nothing', () => {
        sinon.stub(fs, 'stat').callsFake((filePath, callback) => callback(new Error()));
        sinon.stub(fs, 'readFile').callsFake((filePath, encoding, callback) => callback(null, 'something ... ... something'));

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
            .callsFake((filePath, callback) => {
                if (filePath === '/sys/fs/cgroup/memory/memory.limit_in_bytes') callback(null, '333');
                else if (filePath === '/sys/fs/cgroup/memory/memory.usage_in_bytes') callback(null, '111');
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
            .callsFake((filePath, callback) => {
                if (filePath === '/sys/fs/cgroup/memory/memory.limit_in_bytes') callback(null, '333');
                else if (filePath === '/sys/fs/cgroup/memory/memory.usage_in_bytes') callback(null, '111');
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
        const promise = pidusage(NONEXISTING_PID);

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

describe('Apify.utils.sleep()', () => {
    it('works', () => {
        let timeBefore;
        return Promise.resolve()
            .then(() => {
                return Apify.utils.sleep(0);
            })
            .then(() => {
                return Apify.utils.sleep();
            })
            .then(() => {
                return Apify.utils.sleep(null);
            })
            .then(() => {
                return Apify.utils.sleep(-1);
            })
            .then(() => {
                timeBefore = Date.now();
                return Apify.utils.sleep(100);
            })
            .then(() => {
                const timeAfter = Date.now();
                expect(timeAfter - timeBefore).to.be.gte(95);
            });
    });
});

describe('utils.extractUrls()', () => {
    const SIMPLE_URL_LIST = 'simple_url_list.txt';
    const UNICODE_URL_LIST = 'unicode_url_list.txt';
    const COMMA_URL_LIST = 'unicode+comma_url_list.txt';
    const TRICKY_URL_LIST = 'tricky_url_list.txt';
    const INVALID_URL_LIST = 'invalid_url_list.txt';

    const getURLData = (filename) => {
        const string = fs.readFileSync(path.join(__dirname, 'data', filename), 'utf8');
        const array = string.trim().split(/[\r\n]+/g).map(u => u.trim());
        return { string, array };
    };

    const makeJSON = ({ string, array }) => JSON.stringify({
        one: [{ http: string }],
        two: array.map(url => ({ num: 123, url })),
    });
    const makeCSV = (array, delimiter) => array.map(url => ['ABC', 233, url, '.'].join(delimiter || ',')).join('\n');

    const makeText = (array) => {
        const text = fs.readFileSync(path.join(__dirname, 'data', 'lipsum.txt'), 'utf8').split('');
        const ID = 'ů';
        const maxIndex = text.length - 1;
        array.forEach(() => {
            const indexInText = Math.round(Math.random() * maxIndex);
            if (text[indexInText] === ID) {
                text[indexInText + 1] = ID;
            } else {
                text[indexInText] = ID;
            }
        });
        return array.reduce((string, url) => string.replace(ID, ` ${url} `), text.join(''));
    };

    it('extracts simple URLs', () => {
        const { string, array } = getURLData(SIMPLE_URL_LIST);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs', () => {
        const { string, array } = getURLData(UNICODE_URL_LIST);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs with commas', () => {
        const { string, array } = getURLData(COMMA_URL_LIST);
        const extracted = utils.extractUrls({ string, urlRegExp: utils.URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(array);
    });
    it('extracts tricky URLs', () => {
        const { string, array } = getURLData(TRICKY_URL_LIST);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('does not extract invalid URLs', () => {
        const { string } = getURLData(INVALID_URL_LIST);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar']);
    });
    it('extracts simple URLs from JSON', () => {
        const d = getURLData(SIMPLE_URL_LIST);
        const string = makeJSON(d);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('extracts unicode URLs from JSON', () => {
        const d = getURLData(UNICODE_URL_LIST);
        const string = makeJSON(d);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('extracts unicode URLs with commas from JSON', () => {
        const d = getURLData(COMMA_URL_LIST);
        const string = makeJSON(d);
        const extracted = utils.extractUrls({ string, urlRegExp: utils.URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('extracts tricky URLs from JSON', () => {
        const d = getURLData(TRICKY_URL_LIST);
        const string = makeJSON(d);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('does not extract invalid URLs from JSON', () => {
        const d = getURLData(INVALID_URL_LIST);
        const string = makeJSON(d);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar', 'http://www.foo.bar']);
    });
    it('extracts simple URLs from CSV', () => {
        const { array } = getURLData(SIMPLE_URL_LIST);
        const string = makeCSV(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs from CSV', () => {
        const { array } = getURLData(UNICODE_URL_LIST);
        const string = makeCSV(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs with commas from semicolon CSV', () => {
        const { array } = getURLData(COMMA_URL_LIST);
        const string = makeCSV(array, ';');
        const extracted = utils.extractUrls({ string, urlRegExp: utils.URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(array);
    });
    it('extracts tricky URLs from CSV', () => {
        const { array } = getURLData(TRICKY_URL_LIST);
        const string = makeCSV(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('does not extract invalid URLs from CSV', () => {
        const { array } = getURLData(INVALID_URL_LIST);
        const string = makeCSV(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar']);
    });
    it('extracts simple URLs from Text', () => {
        const { array } = getURLData(SIMPLE_URL_LIST);
        const string = makeText(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs from Text', () => {
        const { array } = getURLData(UNICODE_URL_LIST);
        const string = makeText(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs with commas from Text', () => {
        const { array } = getURLData(COMMA_URL_LIST);
        const string = makeText(array);
        const extracted = utils.extractUrls({ string, urlRegExp: utils.URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(array);
    });
    it('extracts tricky URLs from Text', () => {
        const { array } = getURLData(TRICKY_URL_LIST);
        const string = makeText(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('does not extract invalid URLs from Text', () => {
        const { array } = getURLData(INVALID_URL_LIST);
        const string = makeText(array);
        const extracted = utils.extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar']);
    });
});

describe('utils.downloadListOfUrls()', () => {
    let stub;
    beforeEach(() => {
        stub = sinon.stub(requestPromise, 'get');
    });
    afterEach(() => {
        requestPromise.get.restore();
    });

    it('downloads a list of URLs', () => {
        const text = fs.readFileSync(path.join(__dirname, 'data', 'simple_url_list.txt'), 'utf8');
        const arr = text.trim().split(/[\r\n]+/g).map(u => u.trim());
        stub.resolves(text);

        return expect(utils.downloadListOfUrls({
            url: 'nowhere',
        })).to.eventually.deep.equal(arr);
    });
});
