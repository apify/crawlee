const { inlineLinks } = require('dmd/helpers/helpers'); // eslint-disable-line
const ddata = require('dmd/helpers/ddata'); // eslint-disable-line

exports.inlineLinks = (text, options) => {
    if (text) {
        const links = ddata.parseLink(text);
        links.forEach((link) => {
            const linked = ddata._link(link.url, options); // eslint-disable-line no-underscore-dangle
            if (link.caption === link.url) link.caption = linked.name;
            if (linked.url) link.url = linked.url;
            const url = link.url.includes('+') ? link.url : link.url.toLowerCase();
            text = text.replace(link.original, `[\`${link.caption}\`](${url})`);
        });
    }
    return text;
};
