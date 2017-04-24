import fs from 'fs';
import { expect } from 'chai';
import tmp from 'tmp';

// NOTE: use require() here because this is how its done in acts
const Apifier = process.env.TEST_BABEL_BUILD ? require('../build/index') : require('../src/index');

if (process.env.TEST_BABEL_BUILD) console.log('Running with TEST_BABEL_BUILD option');

/* global process */


const createWatchFile = () => {
    const tmpobj = tmp.fileSync();
    const path = tmpobj.name;
    fs.writeSync(tmpobj.fd, 'bla bla bla bla');

    const stat = fs.statSync(path);
    expect(stat.size).to.be.greaterThan(0);
    return path;
};

const testWatchFileEmpty = (path) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const stat = fs.statSync(path);
            if (stat.size !== 0) {
                reject('Watch file not written');
            } else {
                resolve();
            }
        }, 100);
    });
};

// TODO: run tests against build scripts too!

describe('Apifier.main()', () => {
    it('should throw on invalid args', () => {
        process.env.APIFIER_INTERNAL_PORT = 1234;
        expect(() => {
            Apifier.main();
        }).to.throw(Error);
    });

    it('should throw on invalid env vars', () => {
        const fn = () => {
            Apifier.main(() => {});
        };

        process.env.APIFIER_INTERNAL_PORT = null;
        expect(fn).to.throw(Error);

        process.env.APIFIER_INTERNAL_PORT = '';
        expect(fn).to.throw(Error);

        process.env.APIFIER_INTERNAL_PORT = 0;
        expect(fn).to.throw(Error);

        process.env.APIFIER_INTERNAL_PORT = 65536;
        expect(fn).to.throw(Error);
    });

    it('should work well', () => {
        // TODO: pick non-used port number
        process.env.APIFIER_WATCH_FILE = createWatchFile();
        process.env.APIFIER_INTERNAL_PORT = 12345;
        // TODO: use watch file
        Apifier.main(() => {});
        return testWatchFileEmpty(process.env.APIFIER_WATCH_FILE);
    });
});


describe('Apifier.heyIAmReady()', () => {
    it('it works as expected', () => {
        process.env.APIFIER_WATCH_FILE = createWatchFile();
        Apifier.heyIAmReady();
        return testWatchFileEmpty(process.env.APIFIER_WATCH_FILE);
    });
});
