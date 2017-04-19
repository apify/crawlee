import { expect } from 'chai';
import Apifier from '../src/index';

/* global process */

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
        process.env.APIFIER_INTERNAL_PORT = 12345;
        // TODO: use watch file
        Apifier.main(() => {});
    });
});
