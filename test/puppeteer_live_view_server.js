import http from 'http';
import { expect, assert } from 'chai';
import Promise from 'bluebird';
import Apify from '../build/index';

const httpGet = (port) => {
    return new Promise((resolve, reject) => {
        const opts = {
            host: 'localhost',
            port,
        };
        http.get(opts, (res) => {
            let body = '';
            res.on('data', (d) => {
                body += d;
            });
            res.on('end', () => resolve(body));
            res.on('error', reject);
        });
    });
};


describe('Starting the PuppeteerLiveViewServer', () => {
    it('should start using Apify.launchPuppeteer()', () => {
        return Apify.launchPuppeteer({ liveView: true })
            .then(() => httpGet(1234))
            .catch(err => assert.fail(err, 'Server response.'))
            .then((body) => {
                expect(body.trim().substr(0, 15)).to.equal('<!doctype html>');
            });
    });
});
