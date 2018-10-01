const jsdoc2md = require('jsdoc-to-markdown'); // eslint-disable-line
const fs = require('fs');
const path = require('path');

/* input and output paths */
const inputFile = path.join(__dirname, '..', '..', 'src', '**', '*.js');
const outputDir = path.join(__dirname, '..', '..', 'docs');

/* get template data */
const templateData = jsdoc2md.getTemplateDataSync({ files: inputFile });

/* reduce templateData to an array of class names */
const classNames = templateData.reduce((classNames, identifier) => { // eslint-disable-line no-shadow
    if (identifier.kind === 'class' && !identifier.ignore) classNames.push(identifier.name);
    return classNames;
}, []);

/* create a documentation file for each class */
classNames.forEach((className) => {
    const header = `---
id: ${className.toLowerCase()}
title: ${className}
---
`;
    const template = `{{#class name="${className}"}}{{>docs}}{{/class}}`;
    console.log(`Rendering ${className}, template: ${template}`); // eslint-disable-line no-console
    const output = jsdoc2md.renderSync({ data: templateData, template });
    fs.writeFileSync(path.resolve(outputDir, `${className}.md`), header + output);
});
