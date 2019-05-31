const ddata = require('dmd/helpers/ddata'); // eslint-disable-line

/* eslint-disable no-underscore-dangle */

exports.inlineLinks = (text, options) => {
    if (text) {
        const links = ddata.parseLink(text);
        links.forEach((link) => {
            const linked = ddata._link(link.url, options);
            if (link.caption === link.url) link.caption = linked.name;
            if (linked.url) link.url = linked.url;
            const url = link.url.includes('+') ? link.url : link.url.toLowerCase();
            text = text.replace(link.original, `[\`${link.caption}\`](${url})`);
        });
    }
    return text;
};

exports.escape = function escape(input) {
    if (typeof input !== 'string') return null;
    return input.replace(/([*|])/g, '$1');
};

exports.class = (options) => {
    options.hash.kind = 'class';
    const result = ddata._identifier(options);
    if (result && result.kind === 'class') {
        result.scope = 'global';
        delete result.memberof;
    }
    return result ? options.fn(result) : 'ERROR, Cannot find class.';
};
