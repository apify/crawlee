import { ACTOR_BASE_DOCKER_IMAGES, BUILD_TAG_LATEST, ENV_VARS } from 'apify-shared/consts';
import { ACTOR_EVENT_NAMES_EX } from '../build/constants';

describe('consts', () => {
    it('should contain constants from apify-shared', () => {
        expect(Array.isArray(ACTOR_BASE_DOCKER_IMAGES)).toBe(true);
        expect(typeof BUILD_TAG_LATEST).toBe('string');
    });

    it('should contain local constants', () => {
        expect(ENV_VARS).toBeInstanceOf(Object);
        expect(ACTOR_EVENT_NAMES_EX.CPU_INFO).toBe('cpuInfo');
        expect(ACTOR_EVENT_NAMES_EX.PERSIST_STATE).toBe('persistState');
    });
});
