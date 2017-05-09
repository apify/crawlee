import sinon from 'sinon';
import _ from 'underscore';
import { expect } from 'chai';
import * as utils from '../src/utils';

// NOTE: use require() here because this is how its done in acts
const Apifier = process.env.TEST_BABEL_BUILD ? require('../build/index') : require('../src/index');

const options = {
    protocol: 'http',
    host: 'myhost',
    basePath: '/mypath',
    port: 80,
};

describe('Key value store', () => {
    let requestPromiseMock;

    const requestExpectOne = (arg, result) => {
        requestPromiseMock
            .expects('requestPromise')
            .once()
            .withArgs(arg)
            .returns(Promise.resolve(result));
    };

    before(() => {
        requestPromiseMock = sinon.mock(utils, 'requestPromise');
    });

    after(() => {
        requestPromiseMock.verify();
        requestPromiseMock.restore();
    });

    describe('Key value store opening methods work', () => {
        it('should work with ENV variable', () => {
            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id',
            }, {
                _id: 'some-id',
            });

            process.env.APIFY_ACT_RUN_ID = 'some-id';

            return Apifier
                .openKeyValueStore(options)
                .then(() => {
                    delete process.env.APIFY_ACT_RUN_ID;
                });
        });

        it('should work with storeId', () => {
            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id-2',
            }, {
                _id: 'some-id',
            });

            return Apifier.openKeyValueStore(Object.assign({}, options, { storeId: 'some-id-2' }));
        });

        it('should work with user ID and credentials', () => {
            requestExpectOne({
                body: { name: 'somename', ownerUserId: 'someid', token: 'sometoken' },
                json: true,
                method: 'POST',
                url: 'http://myhost:80/mypath',
            }, {
                _id: 'some-id',
            });

            return Apifier.openKeyValueStore(Object.assign({}, options, {
                ownerUserId: 'someid',
                token: 'sometoken',
                name: 'somename',
            }));
        });

        it('should work with username and credentials', () => {
            requestExpectOne({
                body: { name: 'somename', ownerUser: 'someusername', token: 'sometoken' },
                json: true,
                method: 'POST',
                url: 'http://myhost:80/mypath',
            }, {
                _id: 'some-id',
            });

            return Apifier.openKeyValueStore(Object.assign({}, options, {
                ownerUser: 'someusername',
                token: 'sometoken',
                name: 'somename',
            }));
        });
    });

    describe('Key value store REST methods work', () => {
        let store;

        beforeEach(() => {
            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id',
            }, {
                _id: 'some-id',
            });

            const optionsWithId = Object.assign({}, options, { storeId: 'some-id' });

            return Apifier
                .openKeyValueStore(optionsWithId)
                .then((newStore) => {
                    store = newStore;
                });
        });

        it('getStore() works', () => {
            const expected = { _id: 'some-id', aaa: 'bbb' };

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id',
            }, expected);

            return store
                .getStore()
                .then(given => expect(given).to.be.eql(expected));
        });

        it('drop() works', () => {
            requestExpectOne({
                json: true,
                method: 'DELETE',
                url: 'http://myhost:80/mypath/some-id',
            });

            return store.drop();
        });

        it('get() works', () => {
            const expected = 'sometext';

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records/someId',
            }, expected);

            return store
                .get('someId')
                .then(given => expect(given).to.be.eql(expected));
        });

        it('put() works', () => {
            requestExpectOne({
                body: 'someValue',
                headers: { 'Content-Type': 'application/json' },
                json: true,
                method: 'PUT',
                url: 'http://myhost:80/mypath/some-id/records/someKey',
            });

            return store.put('someKey', 'someValue', 'application/json');
        });

        it('delete() works', () => {
            requestExpectOne({
                json: true,
                method: 'DELETE',
                url: 'http://myhost:80/mypath/some-id/records/someKey',
            });

            return store.delete('someKey');
        });

        it('keys() works', () => {
            const expected = ['key1', 'key2', 'key3'];

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=10',
            }, expected);

            return store
                .keys('fromKey', 10)
                .then(given => expect(given).to.be.eql(expected));
        });
    });

    describe('Key value store iteration methods work', () => {
        let store;

        beforeEach(() => {
            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id',
            }, {
                _id: 'some-id',
            });

            const optionsWithId = Object.assign({}, options, { storeId: 'some-id' });

            return Apifier
                .openKeyValueStore(optionsWithId)
                .then((newStore) => {
                    store = newStore;
                });
        });

        it('forEach() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const values = ['val1', 'val2', 'val3', 'val4'];
            const expected = utils.arrays2object(keys, values);

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key1' }, 'val1');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key2' }, 'val2');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key3' }, 'val3');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key4' }, 'val4');

            const result = {};

            return store
                .forEach('fromKey', 5, (value, key) => {
                    result[key] = value;
                })
                .then((response) => {
                    expect(response).to.be.eql(undefined);
                    expect(result).to.be.eql(expected);
                });
        });

        it('forEachKey() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const expected = utils.arrays2object(_.range(0, 4), keys);

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);

            const result = {};

            return store
                .forEachKey('fromKey', 5, (key, index) => {
                    result[index] = key;
                })
                .then((response) => {
                    expect(response).to.be.eql(undefined);
                    expect(result).to.be.eql(expected);
                });
        });

        it('map() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const values = ['val1', 'val2', 'val3', 'val4'];
            const valuesModif = ['val1XXX', 'val2XXX', 'val3XXX', 'val4XXX'];

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key1' }, 'val1');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key2' }, 'val2');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key3' }, 'val3');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key4' }, 'val4');

            return store
                .map('fromKey', 5, (value, key) => {
                    const index = values.indexOf(value);

                    expect(key).to.be.eql(index);

                    return `${value}XXX`;
                })
                .then((response) => {
                    expect(response).to.be.eql(valuesModif);
                });
        });

        it('mapKeys() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const keysModif = ['key1XXX', 'key2XXX', 'key3XXX', 'key4XXX'];

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);

            return store
                .mapKeys('fromKey', 5, (key, index) => {
                    expect(index).to.be.eql(keys.indexOf(key));

                    return `${key}XXX`;
                })
                .then((response) => {
                    expect(response).to.be.eql(keysModif);
                });
        });

        it('mapObject() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const values = ['val1', 'val2', 'val3', 'val4'];
            const valuesModif = ['val1XXX', 'val2XXX', 'val3XXX', 'val4XXX'];
            const expected = utils.arrays2object(keys, valuesModif);

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key1' }, 'val1');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key2' }, 'val2');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key3' }, 'val3');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key4' }, 'val4');

            return store
                .mapObject('fromKey', 5, (value, key) => {
                    const index = values.indexOf(value);

                    expect(key).to.be.eql(keys[index]);

                    return `${value}XXX`;
                })
                .then((response) => {
                    expect(response).to.be.eql(expected);
                });
        });

        it('reduce() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const values = ['val1', 'val2', 'val3', 'val4'];
            const expected = utils.arrays2object(keys, values);
            expected.initialKey = 'initialValue';

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key1' }, 'val1');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key2' }, 'val2');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key3' }, 'val3');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key4' }, 'val4');

            return store
                .reduce('fromKey', 5, (carry, currentVal, currentIndex) => {
                    carry[currentIndex] = currentVal;

                    return carry;
                }, { initialKey: 'initialValue' })
                .then((response) => {
                    expect(response).to.be.eql(expected);
                });
        });

        it('toObject() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const values = ['val1', 'val2', 'val3', 'val4'];
            const expected = utils.arrays2object(keys, values);

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key1' }, 'val1');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key2' }, 'val2');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key3' }, 'val3');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key4' }, 'val4');

            return store
                .toObject('fromKey', 5)
                .then((response) => {
                    expect(response).to.be.eql(expected);
                });
        });

        it('toArray() works', () => {
            const keys = ['key1', 'key2', 'key3', 'key4'];
            const values = ['val1', 'val2', 'val3', 'val4'];

            requestExpectOne({
                json: true,
                method: 'GET',
                url: 'http://myhost:80/mypath/some-id/records?exclusiveStartKey=fromKey&count=5',
            }, keys);
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key1' }, 'val1');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key2' }, 'val2');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key3' }, 'val3');
            requestExpectOne({ json: true, method: 'GET', url: 'http://myhost:80/mypath/some-id/records/key4' }, 'val4');

            return store
                .toArray('fromKey', 5)
                .then((response) => {
                    expect(response).to.be.eql(values);
                });
        });
    });
});
