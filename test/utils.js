import { expect } from 'chai';
import sinon from 'sinon';
import _ from 'underscore';
import fs from 'fs';
import path from 'path';
import os from 'os';
import cheerio from 'cheerio';
import requestPromise from 'request-promise-native';
import LruCache from 'apify-shared/lru_cache';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import * as utils from '../build/utils';
import Apify from '../build/index';

const puppeteer = require('puppeteer');

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
                expect(data).to.include({
                    totalBytes: 333,
                    freeBytes: 222,
                    usedBytes: 111,
                    childProcessesBytes: 0,
                });
                expect(data.mainProcessBytes).to.be.at.least(20000000);

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
                expect(data).to.include({
                    totalBytes: 333,
                    freeBytes: 222,
                    usedBytes: 111,
                    childProcessesBytes: 0,
                });
                expect(data.mainProcessBytes).to.be.at.least(20000000);

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
                        expect(data).to.include({
                            totalBytes: 333,
                            freeBytes: 222,
                            usedBytes: 111,
                        });
                        expect(data.mainProcessBytes).to.be.at.least(20000000);
                        expect(data.childProcessesBytes).to.be.at.least(20000000);
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
                        expect(data).to.include({
                            totalBytes: 333,
                            freeBytes: 222,
                            usedBytes: 111,
                        });
                        expect(data.mainProcessBytes).to.be.at.least(20000000);
                        expect(data.childProcessesBytes).to.be.at.least(20000000);
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

describe('utils.weightedAvg()', () => {
    it('works', () => {
        expect(utils.weightedAvg([10, 10, 10], [1, 1, 1])).to.be.eql(10);
        expect(utils.weightedAvg([5, 10, 15], [1, 1, 1])).to.be.eql(10);
        expect(utils.weightedAvg([10, 10, 10], [0.5, 1, 1.5])).to.be.eql(10);
        expect(utils.weightedAvg([29, 35, 89], [13, 91, 3])).to.be.eql(((29 * 13) + (35 * 91) + (89 * 3)) / (13 + 91 + 3));
        expect(utils.weightedAvg([], [])).to.be.eql(NaN);
        expect(utils.weightedAvg([1], [0])).to.be.eql(NaN);
        expect(utils.weightedAvg([], [1])).to.be.eql(NaN);
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

describe('Apify.utils.extractUrls()', () => {
    const SIMPLE_URL_LIST = 'simple_url_list.txt';
    const UNICODE_URL_LIST = 'unicode_url_list.txt';
    const COMMA_URL_LIST = 'unicode+comma_url_list.txt';
    const TRICKY_URL_LIST = 'tricky_url_list.txt';
    const INVALID_URL_LIST = 'invalid_url_list.txt';

    const { extractUrls, URL_WITH_COMMAS_REGEX } = utils.publicUtils;

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
        array.forEach((__, index) => {
            const indexInText = (index * 17) % maxIndex;
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
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs', () => {
        const { string, array } = getURLData(UNICODE_URL_LIST);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs with commas', () => {
        const { string, array } = getURLData(COMMA_URL_LIST);
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(array);
    });
    it('extracts tricky URLs', () => {
        const { string, array } = getURLData(TRICKY_URL_LIST);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('does not extract invalid URLs', () => {
        const { string } = getURLData(INVALID_URL_LIST);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar']);
    });
    it('extracts simple URLs from JSON', () => {
        const d = getURLData(SIMPLE_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('extracts unicode URLs from JSON', () => {
        const d = getURLData(UNICODE_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('extracts unicode URLs with commas from JSON', () => {
        const d = getURLData(COMMA_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('extracts tricky URLs from JSON', () => {
        const d = getURLData(TRICKY_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(d.array.concat(d.array));
    });
    it('does not extract invalid URLs from JSON', () => {
        const d = getURLData(INVALID_URL_LIST);
        const string = makeJSON(d);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar', 'http://www.foo.bar']);
    });
    it('extracts simple URLs from CSV', () => {
        const { array } = getURLData(SIMPLE_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs from CSV', () => {
        const { array } = getURLData(UNICODE_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs with commas from semicolon CSV', () => {
        const { array } = getURLData(COMMA_URL_LIST);
        const string = makeCSV(array, ';');
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(array);
    });
    it('extracts tricky URLs from CSV', () => {
        const { array } = getURLData(TRICKY_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('does not extract invalid URLs from CSV', () => {
        const { array } = getURLData(INVALID_URL_LIST);
        const string = makeCSV(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar']);
    });
    it('extracts simple URLs from Text', () => {
        const { array } = getURLData(SIMPLE_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs from Text', () => {
        const { array } = getURLData(UNICODE_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('extracts unicode URLs with commas from Text', () => {
        const { array } = getURLData(COMMA_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string, urlRegExp: URL_WITH_COMMAS_REGEX });
        expect(extracted).to.be.eql(array);
    });
    it('extracts tricky URLs from Text', () => {
        const { array } = getURLData(TRICKY_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(array);
    });
    it('does not extract invalid URLs from Text', () => {
        const { array } = getURLData(INVALID_URL_LIST);
        const string = makeText(array);
        const extracted = extractUrls({ string });
        expect(extracted).to.be.eql(['http://www.foo.bar']);
    });
});

describe('Apify.utils.downloadListOfUrls()', () => {
    const { downloadListOfUrls } = utils.publicUtils;
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

        return expect(downloadListOfUrls({
            url: 'nowhere',
        })).to.eventually.deep.equal(arr);
    });
});

describe('Apify.utils.getRandomUserAgent()', () => {
    it('works', () => {
        const agent = utils.publicUtils.getRandomUserAgent();
        expect(agent).to.be.a('string');
        expect(agent.length).to.not.be.eql(0);
    });
});

describe('utils.openLocalStorage()', async () => {
    it('should return item from cache if available and create new one otherwise', async () => {
        const cache = new LruCache({ maxLength: 5 });
        class MyStore {}

        expect(cache.length()).to.be.eql(0);

        const store = await utils.openLocalStorage('some-id', 'some-env', MyStore, cache);
        expect(store).to.be.instanceOf(MyStore);
        expect(cache.length()).to.be.eql(1);

        const store2 = await utils.openLocalStorage('some-id', 'some-env', MyStore, cache);
        expect(store2).to.be.equal(store);
        expect(cache.length()).to.be.eql(1);

        const store3 = await utils.openLocalStorage('some-other-id', 'some-env', MyStore, cache);
        expect(store3).to.not.be.equal(store);
        expect(cache.length()).to.be.eql(2);
    });

    it('should use ID from ENV variable if no parameter is provided', async () => {
        const cache = new LruCache({ maxLength: 5 });
        class MyStore {
            constructor(id) {
                this.id = id;
            }
        }

        process.env['some-env'] = 'id-from-env';

        const store = await utils.openLocalStorage(null, 'some-env', MyStore, cache);
        expect(store.id).to.eql('id-from-env');

        delete process.env['some-env'];
    });

    it('should use ID from shared if neither parameter nor ENV var is provided', async () => {
        const cache = new LruCache({ maxLength: 5 });
        class MyStore {
            constructor(id) {
                this.id = id;
            }
        }

        // There is some default in shared constants.
        const defaultLocalValue = LOCAL_ENV_VARS[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID];
        expect(defaultLocalValue).to.be.a('string');
        expect(defaultLocalValue).to.have.length.above(1);

        // There is no env var!
        expect(process.env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID]).to.be.eql(undefined);

        const store = await utils.openLocalStorage(null, ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID, MyStore, cache);
        expect(store.id).to.eql(defaultLocalValue);
    });
});

describe('utils.openRemoteStorage()', async () => {
    it('should return item from cache if available and create new one otherwise', async () => {
        const cache = new LruCache({ maxLength: 5 });
        class MyStore {
            constructor(id) {
                this.id = id;
            }
        }

        delete process.env['some-env'];

        expect(cache.length()).to.be.eql(0);

        const store = await utils.openRemoteStorage('some-id', 'some-env', MyStore, cache, async () => ({ id: 'some-id' }));
        expect(store.id).to.be.eql('some-id');
        expect(cache.length()).to.be.eql(1);

        const store2 = await utils.openRemoteStorage('some-id', 'some-env', MyStore, cache, async () => { throw new Error('Should not be called!'); }); // eslint-disable-line
        expect(store2.id).to.be.eql('some-id');
        expect(store2).to.be.equal(store);
        expect(cache.length()).to.be.eql(1);

        const store3 = await utils.openRemoteStorage('some-other-id', 'some-env', MyStore, cache, async () => ({ id: 'some-other-id' }));
        expect(store3).to.not.be.equal(store);
        expect(store3.id).to.be.eql('some-other-id');
        expect(cache.length()).to.be.eql(2);
    });

    it('should use ID from ENV variable if no parameter is provided', async () => {
        const cache = new LruCache({ maxLength: 5 });
        class MyStore {
            constructor(id) {
                this.id = id;
            }
        }

        process.env['some-env'] = 'id-from-env';

        const store = await utils.openLocalStorage(null, 'some-env', MyStore, cache);
        expect(store.id).to.eql('id-from-env');

        delete process.env['some-env'];
    });

    it('should use ID from ENV variable and not call getOrCreateStoreFunction parameter is not provided', async () => {
        const cache = new LruCache({ maxLength: 5 });
        class MyStore {
            constructor(id) {
                this.id = id;
            }
        }

        process.env['some-env'] = 'id-from-env';

        const store = await utils.openRemoteStorage(null, 'some-env', MyStore, cache, async () => { throw new Error('Should not be called!'); }); // eslint-disable-line
        expect(store.id).to.eql('id-from-env');

        delete process.env['some-env'];
    });
});

const checkHtmlToText = (html, expectedText, hasBody = false) => {
    const text1 = Apify.utils.htmlToText(html);
    expect(text1).to.eql(expectedText);

    // Test embedding into <body> gives the same result
    if (typeof html === 'string' && !hasBody) {
        const html2 = `
        <html>
            <head>
                <title>Title should be ignored</title>
                <style>
                    .styles_should_be_ignored_too {}
                </style>
                <script type="application/javascript">
                    scriptsShouldBeIgnoredToo();
                </script>
            </head>
            <body>
                ${html}
            </body>
        </html>`;
        const text2 = Apify.utils.htmlToText(html2);
        expect(text2).to.eql(expectedText);
    }
};

describe('utils.htmlToText()', () => {
    it('handles invalid args', () => {
        checkHtmlToText(null, '');
        checkHtmlToText('', '');
        checkHtmlToText(0, '');
        checkHtmlToText(undefined, '');
    });

    it('handles basic HTML elements correctly', () => {
        checkHtmlToText('Plain text node', 'Plain text node');
        checkHtmlToText('   Plain    text     node    ', 'Plain text node');
        checkHtmlToText('   \nPlain    text     node  \n  ', 'Plain text node');

        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2>', 'Header 1\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2><br>', 'Header 1\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2><br><br>', 'Header 1\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2><br><br><br>', 'Header 1\nHeader 2');

        checkHtmlToText('<h1>Header 1</h1><br><h2>Header 2</h2><br><br><br>', 'Header 1\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <br> <h2>Header 2</h2><br><br><br>', 'Header 1\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1>  \n <br>\n<h2>Header 2</h2><br><br><br>', 'Header 1\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1>  \n <br>\n<br><h2>Header 2</h2><br><br><br>', 'Header 1\n\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1>  \n <br>\n<br><br><h2>Header 2</h2><br><br><br>', 'Header 1\n\n\n\nHeader 2');

        checkHtmlToText('<div><div>Div</div><p>Paragraph</p></div>', 'Div\nParagraph');
        checkHtmlToText('<div>Div1</div><!-- Some comments --><div>Div2</div>', 'Div1\nDiv2');

        checkHtmlToText('<div>Div1</div><style>Skip styles</style>', 'Div1');
        checkHtmlToText('<script>Skip_scripts();</script><div>Div1</div>', 'Div1');
        checkHtmlToText('<SCRIPT>Skip_scripts();</SCRIPT><div>Div1</div>', 'Div1');
        checkHtmlToText('<svg>Skip svg</svg><div>Div1</div>', 'Div1');
        checkHtmlToText('<canvas>Skip canvas</canvas><div>Div1</div>', 'Div1');

        checkHtmlToText('<b>A  B  C  D  E\n\nF  G</b>', 'A B C D E F G');
        checkHtmlToText('<pre>A  B  C  D  E\n\nF  G</pre>', 'A  B  C  D  E\n\nF  G');

        checkHtmlToText(
            '<h1>Heading 1</h1><div><div><div><div>Deep  Div</div></div></div></div><h2>Heading       2</h2>',
            'Heading 1\nDeep Div\nHeading 2',
        );

        checkHtmlToText('<a>this_word</a>_should_<b></b>be_<span>one</span>', 'this_word_should_be_one');
        checkHtmlToText('<span attributes="should" be="ignored">some <span>text</span></span>', 'some text');

        checkHtmlToText(
            `<table>
                <tr>
                    <td>Cell    A1</td><td>Cell A2</td>
                    <td>    Cell A3    </td>
                </tr>
                <tr>
                    <td>Cell    B1</td><td>Cell B2</td>
                </tr>
            </table>`,
            'Cell A1\tCell A2\tCell A3 \t\nCell B1\tCell B2',
        );
    });

    it('handles HTML entities correctly', () => {
        checkHtmlToText('<span>&aacute; &eacute;</span>', 'á é');
    });

    it('handles larger HTML documents', () => {
        const html1 = fs.readFileSync(path.join(__dirname, 'data', 'html_to_text_test.html'), 'utf8');
        const text1 = fs.readFileSync(path.join(__dirname, 'data', 'html_to_text_test.txt'), 'utf8');

        // Careful here - don't change any whitespace in the text below or the test will break, even trailing!
        checkHtmlToText(html1, text1, true);
    });

    it('works with Cheerio object', () => {
        const html1 = '<html><body>Some text</body></html>';
        checkHtmlToText(cheerio.load(html1, { decodeEntities: true }), 'Some text');

        const html2 = '<h1>Text outside of body</h1>';
        checkHtmlToText(cheerio.load(html2, { decodeEntities: true }), 'Text outside of body');
    });
});

describe('utils.createRequestDebugInfo()', () => {
    it('handles Puppeteer response', () => {
        const request = {
            id: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            someThingElse: 'xxx',
            someOther: 'yyy',
        };

        const response = {
            status: () => 201,
            another: 'yyy',
        };

        const additionalFields = {
            foo: 'bar',
        };

        expect(Apify.utils.createRequestDebugInfo(request, response, additionalFields)).to.be.eql({
            requestId: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            statusCode: 201,
            foo: 'bar',
        });
    });

    it('handles NodeJS response', () => {
        const request = {
            id: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            someThingElse: 'xxx',
            someOther: 'yyy',
        };

        const response = {
            statusCode: 201,
            another: 'yyy',
        };

        const additionalFields = {
            foo: 'bar',
        };

        expect(Apify.utils.createRequestDebugInfo(request, response, additionalFields)).to.be.eql({
            requestId: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            statusCode: 201,
            foo: 'bar',
        });
    });
});

describe('utils.snakeCaseToCamelCase()', () => {
    it('should camel case all sneaky cases of snake case', () => {
        const tests = {
            aaa_bbb_: 'aaaBbb',
            '': '',
            AaA_bBb_cCc: 'aaaBbbCcc',
            a_1_b_1a: 'a1B1a',
        };

        _.mapObject(tests, (camelCase, snakeCase) => {
            expect(utils.snakeCaseToCamelCase(snakeCase)).to.be.eql(camelCase);
        });
    });
});

describe('utils.addTimeoutToPromise()', () => {
    it('should timeout', async () => {
        const clock = sinon.useFakeTimers();
        try {
            const p = utils.addTimeoutToPromise(
                new Promise(r => setTimeout(r, 500)),
                100,
                'Timed out.',
            );
            clock.tick(101);
            await p;
            throw new Error('Wrong error.');
        } catch (err) {
            expect(err.message).to.be.eql('Timed out.');
        } finally {
            clock.restore();
        }
    });
    it('should not timeout too soon', async () => {
        const clock = sinon.useFakeTimers();
        try {
            const p = utils.addTimeoutToPromise(
                new Promise(r => setTimeout(() => r('Done'), 100)),
                500,
                'Timed out.',
            );
            clock.tick(101);
            expect(await p).to.be.eql('Done');
        } catch (err) {
            throw new Error('This should not fail.');
        } finally {
            clock.restore();
        }
    });
});

describe('utils.infiniteScroll()', () => {
    it('exits after no more to scroll', () => {
        (async () => {
            const browser = await puppeteer.launch({
                headless: true,
            });
            const page = await browser.newPage();
            const contentHTML = '<div>nothing</div>';
            await page.setContent(contentHTML);
            await utils.infiniteScroll(page);
            await browser.close();
        })();
    });

    it('exits after reaches the bottom', () => {
        (async () => {
            const browser = await puppeteer.launch({
                headless: true,
            });
            const page = await browser.newPage();
            await page.goto('https://twitter.com/search?src=typd&q=%23fingervein&lang=sv', {
                waitUntil: 'networkidle2',
            });
            await utils.infiniteScroll(page);
            await browser.close();
        })();
    });

    it('times out if limit is set', () => {
        (async () => {
            const browser = await puppeteer.launch({
                headless: true,
            });
            const page = await browser.newPage();
            await page.goto('https://medium.com/search?q=biometrics', {
                waitUntil: 'networkidle2',
            });
            const TIMEOUT_AFTER = 10; // seconds
            await utils.infiniteScroll(page, TIMEOUT_AFTER);
            await browser.close();
        })();
    });
});
