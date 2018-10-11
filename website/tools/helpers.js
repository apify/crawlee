const { inlineLinks } = require('dmd/helpers/helpers'); // eslint-disable-line

exports.inlineLinks = (...args) => {
    const text = inlineLinks(...args);
    return (text && typeof text === 'string') ? text.replace(/\((.*)\)/, (match, p1) => `(${p1.toLowerCase()})`) : text;
};
