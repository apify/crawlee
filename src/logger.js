import log from './utils_log';

/**
 * Creates prefixed log child instance
 *
 * @param {string} prefix
 * @ignore
 */
export const createLogger = (prefix) => {
    return log.child({ prefix });
};
