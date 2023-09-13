const { urlToRequest } = require('loader-utils');

export default function (source) {
    console.log('The request path', urlToRequest(this.resourcePath));

    console.log(source);

    // Apply some transformations to the source...

    return source;
}
