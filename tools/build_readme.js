/* eslint-disable no-console */
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { URL } = require('url');

const docPath = path.join(__dirname, '..', 'docs');

console.log('Reading documentation files.');
const introduction = readFileSync(path.join(docPath, 'readme', 'introduction.md'), 'utf8');
const motivation = readFileSync(path.join(docPath, 'guides', 'motivation.md'), 'utf8');
const overview = readFileSync(path.join(docPath, 'readme', 'overview.md'), 'utf8');
const gettingStarted = readFileSync(path.join(docPath, 'guides', 'quick_start.md'), 'utf8');
const support = readFileSync(path.join(docPath, 'readme', 'support.md'), 'utf8');

const headerRx = /---.*?title: (.+)\n.*?---/s;
const headerReplace = '## $1';
const hashRx = /## /g;
const hashReplace = '### ';

const fixHeaders = doc => doc.replace(hashRx, hashReplace).replace(headerRx, headerReplace);

const linkRx = /\[(.*?)]\((.*?)\)/g;
const fixLinks = (match, p1, p2) => {
    const url = new URL(p2, 'https://sdk.apify.com/docs/something/'); // <- the links use ../ so we need something to go up from
    return `[${p1}](${url})`;
};

const readme = [
    introduction,
    fixHeaders(motivation),
    overview,
    fixHeaders(gettingStarted).replace(linkRx, fixLinks),
    support,
].join('\n');

console.log('Writing new README.md');
writeFileSync(path.join(__dirname, '..', 'README.md'), readme);
