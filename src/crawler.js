import _ from 'underscore';

import { newPromise, objectToQueryString } from './utils';

const request = require('request-promise');

const BASE_URL = 'https://api.apifier.com/v1';

let defaultUserId;
let defaultToken;

export const setDefaultToken = (newDefaultToken) => {
    defaultToken = newDefaultToken;
};

export const setDefaultUserId = (newDefaultUserId) => {
    defaultUserId = newDefaultUserId;
};

export const getAllCrawlers = (params, userId, token) => {
    params = params || {};
    params.token = token || defaultToken;
    userId = userId || defaultUserId;

    const queryString = objectToQueryString(params);
    const requestParams = {
        url: `${BASE_URL}/${userId}/crawlers${queryString}`,
        json: true,
        resolveWithFullResponse: true,
    };

    return newPromise().then(() => (request
        .get(requestParams)))
        .then((response) => {
            const crawlers = response.body;
            console.log(`crawlers: ${crawlers}`);
            // checkPaginationHeaders(response, params, crawlers.length);
            // checkResponse(response);
            // if (!suppressSchemaCheck) crawlers.map(crawler => schemaValidator.validate('CrawlerShort', crawler));

            return crawlers;
        });
};

export const startCrawler = (crawlerId, params, userId, token) => {
    params = params || {};
    params.token = token || defaultToken;
    userId = userId || defaultUserId;

    const queryString = objectToQueryString(params);
    const requestParams = {
        url: `${BASE_URL}/${userId}/crawlers/${crawlerId}/execute${queryString}`,
        json: true,
        resolveWithFullResponse: true,
    };

    return newPromise().then(() => (request
        .post(requestParams)))
        .then((response) => {
            // checkResponse(response, 201);
            const execution = response.body;

            if (!_.isObject(execution)) return reject('Unknown error of api Start Crawler API request');
            if (execution.type === 'CRAWLING_PROCESS_QUOTA_EXCEEDED') return reject('CRAWLING_PROCESS_QUOTA_EXCEEDED');

            console.log(`execution: ${execution}`);
            // if (!suppressSchemaCheck) schemaValidator.validate('CrawlerExecution', execution);

            return execution;
        });
};
