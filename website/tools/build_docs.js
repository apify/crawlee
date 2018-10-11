const jsdoc2md = require('jsdoc-to-markdown'); // eslint-disable-line
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);

/* eslint-disable no-shadow */

const getHeader = (title, prefix = '') => {
    const id = `${prefix}${title.replace(' ', '').toLowerCase()}`;
    return `---\nid: ${id}\ntitle: ${title}\n---\n`;
};

const getRenderOptions = (template, data) => ({
    template,
    data,
    'name-format': true,
    'param-list-format': 'table',
    helper: [path.join(__dirname, 'helpers.js')],
    partial: [path.join(__dirname, 'partials', 'params-table.hbs')],
});

const readFileFromLine = async (path, lineNumber = 1) => {
    return new Promise((resolve, reject) => {
        const output = [];
        const rl = readline.createInterface({
            input: fs.createReadStream(path),
            crlfDelay: Infinity,
        });
        let lineCounter = 0;
        rl.on('line', (line) => {
            lineCounter++;
            if (lineCounter >= lineNumber) output.push(line);
        });
        rl.on('close', () => resolve(output.join('\n')));
        rl.on('error', err => reject(err));
    });
};

const main = async () => {
    /* input and output paths */
    const sourceFiles = path.join(__dirname, '..', '..', 'src', '**', '*.js');
    const exampleFiles = path.join(__dirname, '..', '..', 'examples', '**', '*.js');
    const sourceFilesOutputDir = path.join(__dirname, '..', '..', 'docs', 'api');
    const exampleFilesOutputDir = path.join(__dirname, '..', '..', 'docs', 'examples');

    /* get template data */
    const templateData = jsdoc2md.getTemplateDataSync({ files: sourceFiles });
    const exampleData = jsdoc2md.getTemplateDataSync({ files: exampleFiles });

    // handle examples
    const examplePromises = exampleData.map(async (example) => {
        const { description, meta: { filename, path: filepath, lineno } } = example;
        const code = await readFileFromLine(path.join(filepath, filename), lineno);
        const sep = '```';
        const codeblock = `${sep}javascript\n${code}\n${sep}`;

        const title = filename.split('.')[0].split('_').map(word => `${word[0].toUpperCase()}${word.substr(1)}`).join(' ');
        const header = getHeader(title);
        const markdown = `${header}\n${description}\n${codeblock}`;
        await writeFile(path.join(exampleFilesOutputDir, `${title.replace(' ', '')}.md`), markdown);
    });

    await Promise.all(examplePromises);

    /* reduce templateData to an array of class names */
    const classNames = templateData.reduce((classNames, identifier) => {
        if (identifier.kind === 'class' && !identifier.ignore) classNames.push(identifier.name);
        return classNames;
    }, []);


    // create a doc file for Apify
    const mainModule = 'Apify';
    const header = getHeader(mainModule);
    const template = `{{#module name="${mainModule}"}}{{>docs}}{{/module}}`;
    console.log(`Rendering ${mainModule}, template: ${template}`); // eslint-disable-line no-console
    const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
    fs.writeFileSync(path.resolve(sourceFilesOutputDir, `${mainModule}.md`), header + output);

    // create a doc file file for each class
    classNames.forEach((className) => {
        const header = getHeader(className);
        const template = `{{#class name="${className}"}}{{>docs}}{{/class}}`;
        console.log(`Rendering ${className}, template: ${template}`); // eslint-disable-line no-console
        const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
        fs.writeFileSync(path.resolve(sourceFilesOutputDir, `${className}.md`), header + output);
    });
};

main();
