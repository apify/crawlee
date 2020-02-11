// eslint-disable-next-line import/no-duplicates
import ApifyDefault from '../build/index';
// eslint-disable-next-line import/no-duplicates
import * as ApifyWithWildcard from '../build/index';
// eslint-disable-next-line global-require
const apify = require('../build');

describe('Apify module', () => {
    test('import Apify from \'apify\' - should fail', () => {
        expect(ApifyDefault).not.toBeUndefined();
        expect(ApifyDefault.default).toBeUndefined();
    });
    test('import * as Apify from \'apify\'', () => {
        expect(ApifyWithWildcard).not.toBeUndefined();
        expect(ApifyWithWildcard.default).not.toBeUndefined();
    });
    test('const apify = require(\'apify\')', () => {
        expect(apify).not.toBeUndefined();
        expect(apify.default).not.toBeUndefined();
    });
});
