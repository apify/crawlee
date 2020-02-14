/// <reference types="jest"/>
import Apify from "../..";

describe('Typescript with Apify.utils.log', () => {
    const log = Apify.utils.log;

    test('log.debug()', () => {
        log.debug('Debug level log');
    });

    test('log.info()', () => {
        log.info('Info Level log');
    });

    test('log.warning()', () => {
        log.warning('Warning Level log');
    });

    test('log.error()', () => {
        log.error('Error Level log');
    });
});
