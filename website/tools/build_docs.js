const jsdoc2md = require('jsdoc-to-markdown'); // eslint-disable-line
const fs = require('fs');
const path = require('path');

/* eslint-disable no-shadow */

/* input and output paths */
const inputFile = path.join(__dirname, '..', '..', 'src', '**', '*.js');
const outputDir = path.join(__dirname, '..', '..', 'docs');

/* get template data */
const templateData = jsdoc2md.getTemplateDataSync({ files: inputFile });

/* reduce templateData to an array of class names */
const classNames = templateData.reduce((classNames, identifier) => {
    if (identifier.kind === 'class' && !identifier.ignore) classNames.push(identifier.name);
    return classNames;
}, []);

const getHeader = title => `---
id: ${title.toLowerCase()}
title: ${title}
---
`;

// create a doc file for Apify
const mainModule = 'Apify';
const header = getHeader(mainModule);
const template = `{{#module name="${mainModule}"}}{{>docs}}{{/module}}`;
console.log(`Rendering ${mainModule}, template: ${template}`); // eslint-disable-line no-console
const output = jsdoc2md.renderSync({ data: templateData, template, 'name-format': true });
fs.writeFileSync(path.resolve(outputDir, `${mainModule}.md`), header + output);

// create a doc file file for each class
classNames.forEach((className) => {
    const header = getHeader(className);
    const template = `{{#class name="${className}"}}{{>docs}}{{/class}}`;
    console.log(`Rendering ${className}, template: ${template}`); // eslint-disable-line no-console
    const output = jsdoc2md.renderSync({ data: templateData, template, 'name-format': true });
    fs.writeFileSync(path.resolve(outputDir, `${className}.md`), header + output);
});
