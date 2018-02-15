import { expect } from 'chai';
import { ACTOR_BASE_DOCKER_IMAGES, BUILD_TAG_LATEST, ENV_VARS } from '../build/constants';

describe('consts', () => {
    it('should contain constants from apify-shared', () => {
        expect(ACTOR_BASE_DOCKER_IMAGES).to.be.a('array');
        expect(BUILD_TAG_LATEST).to.be.a('string');
    });

    it('should contain local constants', () => {
        expect(ENV_VARS).to.be.a('object');
    });
});
