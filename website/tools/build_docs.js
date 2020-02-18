const jsdoc2md = require('jsdoc-to-markdown'); // eslint-disable-line
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const prettier = require('prettier'); // eslint-disable-line
const prettierConfig = require('./prettier.config');

const writeFile = promisify(fs.writeFile);

/* eslint-disable no-shadow */

const classNames = [];
const namespaces = [];
const typedefs = [];

const getHeader = (title) => {
    const prefix = /puppeteer|social|log/.test(title) ? 'utils.' : '';
    const id = title.replace(/\s/g, '').toLowerCase();
    return `---\nid: ${id}\ntitle: ${prefix}${title}\n---\n`;
};

const getRenderOptions = (template, data) => ({
    template,
    data,
    'name-format': true,
    'param-list-format': 'table',
    'heading-depth': 1,
    helper: [path.join(__dirname, 'helpers.js')],
    partial: [
        path.join(__dirname, 'partials', 'params-table.hbs'),
        path.join(__dirname, 'partials', 'properties-table.hbs'),
        path.join(__dirname, 'partials', 'link.hbs'),
    ],
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

const generateFinalMarkdown = (title, text) => {
    const header = getHeader(title);
    // Remove Class titles so we don't have double page titles with Docusaurus.
    const rx = new RegExp(`# \`?${title}\`?.*?\n`);
    text = text.replace(rx, '');
    // Remove 'Kind' annotations.
    text = text.replace(/\*\*Kind\*\*.*\n/g, '');
    // Remove dots in type annotations and replace entities
    const dotsRx = /([A-Z][a-z]+)\.&lt;(.+)&gt;/g;
    const replacer = (match, p1, p2) => {
        return `${p1}<${p2.replace(dotsRx, replacer)}>`;
    };
    text = text.replace(dotsRx, replacer);
    // Fix class links
    const linksRx = new RegExp(`([("])#(module_)?(${classNames.join('|')})([)"])`, 'gi');
    text = text.replace(linksRx, (match, p1, p2, p3, p4) => p1 + p3.toLowerCase() + p4);
    // Fix typedef links
    const typeLinkRx = new RegExp(`([("])#(module_)?(${typedefs.join('|')})([)"])`, 'gi');
    text = text.replace(typeLinkRx, (match, p1, p2, p3, p4) => `${p1}../typedefs/${p3.toLowerCase()}${p4}`);
    // Format Markdown with Prettier
    return prettier.format(header + text, prettierConfig);
};

const main = async () => {
    /* input and output paths */
    const sourceFiles = path.join(__dirname, '..', '..', 'src', '**', '*.js');
    const exampleFiles = path.join(__dirname, '..', '..', 'examples', '**', '*.js');
    const sourceFilesOutputDir = path.join(__dirname, '..', '..', 'docs', 'api');
    const typeFilesOutputDir = path.join(__dirname, '..', '..', 'docs', 'typedefs');
    const exampleFilesOutputDir = path.join(__dirname, '..', '..', 'docs', 'examples');

    /* get template data */
    const templateData = await jsdoc2md.getTemplateData({ files: sourceFiles });
    const exampleData = await jsdoc2md.getTemplateData({ files: exampleFiles });

    // handle examples
    const examplePromises = exampleData.map(async (example) => {
        const { description, meta: { filename, path: filepath, lineno } } = example;
        const code = await readFileFromLine(path.join(filepath, filename), lineno);
        const sep = '```';
        const codeblock = `${sep}javascript\n${code}\n${sep}`;

        const title = filename.split('.')[0].split('_').map(word => `${word[0].toUpperCase()}${word.substr(1)}`).join(' ');
        const header = getHeader(title);
        const markdown = prettier.format(`${header}\n${description}\n${codeblock}`, prettierConfig);
        await writeFile(path.join(exampleFilesOutputDir, `${title.replace(/\s/g, '')}.md`), markdown);
    });

    await Promise.all(examplePromises);

    /* reduce templateData to an array of class names */
    templateData.forEach((identifier) => {
        if (identifier.kind === 'class' && !identifier.ignore) classNames.push(identifier.name);
        if (identifier.kind === 'namespace' && !identifier.ignore) namespaces.push(identifier.name);
        if (identifier.kind === 'typedef' && !identifier.ignore) typedefs.push(identifier.name);
    });


    // create a doc file for Apify
    const mainModule = 'Apify';
    const template = `{{#module name="${mainModule}"}}{{>docs}}{{/module}}`;
    console.log(`Rendering ${mainModule}, template: ${template}`); // eslint-disable-line no-console
    const moduleData = [];
    const otherData = [];
    templateData.forEach((item) => {
        if (item.id.startsWith('module:Apify')) moduleData.push(item);
        else otherData.push(item);
    });
    const comparator = (a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
    };
    const finalData = moduleData.sort(comparator).concat(otherData);

    const output = jsdoc2md.renderSync(getRenderOptions(template, finalData));
    const markdown = generateFinalMarkdown(mainModule, output);
    fs.writeFileSync(path.resolve(sourceFilesOutputDir, `${mainModule}.md`), markdown);

    // create a doc file file for each class
    classNames.forEach((className) => {
        const template = `{{#class name="${className}"}}{{>docs}}{{/class}}`;
        console.log(`Rendering ${className}, template: ${template}`); // eslint-disable-line no-console
        const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
        const markdown = generateFinalMarkdown(className, output);
        fs.writeFileSync(path.resolve(sourceFilesOutputDir, `${className}.md`), markdown);
    });

    // create a doc file file for each namespace
    namespaces.forEach((name) => {
        const template = `{{#namespace name="${name}"}}{{>docs}}{{/namespace}}`;
        console.log(`Rendering ${name}, template: ${template}`); // eslint-disable-line no-console
        const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
        const markdown = generateFinalMarkdown(name, output);
        fs.writeFileSync(path.resolve(sourceFilesOutputDir, `${name}.md`), markdown);
    });

    // create a doc file for each type
    typedefs.forEach((name) => {
        const template = `{{#identifier name="${name}"}}{{>docs}}{{/identifier}}`;
        console.log(`Rendering ${name}, template: ${template}`); // eslint-disable-line no-console
        const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
        const markdown = generateFinalMarkdown(name, output);
        fs.writeFileSync(path.resolve(typeFilesOutputDir, `${name}.md`), markdown);
    });
};

main();
