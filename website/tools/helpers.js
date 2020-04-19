const ddata = require('dmd/helpers/ddata'); // eslint-disable-line

/* eslint-disable no-underscore-dangle */

exports.inlineLinks = (text) => {
    if (text) {
        const links = ddata.parseLink(text);
        links.forEach((link) => {
            // const linked = ddata._link(link.url, options);
            // if (link.caption === link.url) link.caption = linked.name;
            // if (linked.url) link.url = linked.url;
            // const url = link.url.includes('+') ? link.url : link.url.toLowerCase();
            text = text.replace(link.original, `LINK!${link.caption}!LINK`);
        });
    }
    return text;
};

exports.escape = function escape(input) {
    if (typeof input !== 'string') return null;
    return input.replace(/([*|])/g, '$1');
};

exports.lowerCase = text => text.toLowerCase();

exports.class = (options) => {
    options.hash.kind = 'class';
    const result = ddata._identifier(options);
    if (result && result.kind === 'class') {
        result.scope = 'global';
        delete result.memberof;
    }
    return result ? options.fn(result) : 'ERROR, Cannot find class.';
};

exports.params = function params(options) {
    if (this.params) {
        const list = this.params.map((param) => {
            const nameSplit = param.name.split('.');
            let name = nameSplit[nameSplit.length - 1];
            if (param.variable) name = `...${name}`;
            if (param.optional) name = `[${name}]`;
            return {
                indent: '    '.repeat(nameSplit.length - 1),
                name,
                type: param.type,
                optional: param.optional,
                defaultvalue: param.defaultvalue,
                description: param.description,
            };
        });
        return options.fn(list);
    }
};
