import { expect } from 'chai';

// NOTE: use require() here because this how its done in acts
const Apifier = process.env.TEST_BABEL_BUILD ? require('../build/index') : require('../src/index');

if (process.env.TEST_BABEL_BUILD) console.log('Running with TEST_BABEL_BUILD option');

/* global process */

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
        process.env.APIFIER_INTERNAL_PORT = 12345;
        // TODO: use watch file
        Apifier.main(() => {});
    });
});
