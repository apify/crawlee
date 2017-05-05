const request = require('request-promise');
// const Promise = require('bluebird');

export const getAllCrawlers = (url, userId, token, suppressSchemaCheck, params) => {
    params = params || {};
    params.token = token;

    const queryString = objectToQueryString(params);
    const requestParams = {
        url: `${url}/v1/${userId}/crawlers?${queryString}`,
        json: true,
        resolveWithFullResponse: true,
    };

    return request
        .get(requestParams)
        .then((response) => {
            const crawlers = response.body;
            checkPaginationHeaders(response, params, crawlers.length);
            checkResponse(response);
            if (!suppressSchemaCheck) crawlers.map(crawler => schemaValidator.validate('CrawlerShort', crawler));

            return crawlers;
        });
};
