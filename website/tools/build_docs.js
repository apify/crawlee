const decamelize = require('decamelize');
const fs = require('fs-extra');
const jsdoc2md = require('jsdoc-to-markdown'); // eslint-disable-line
const path = require('path');
const prettier = require('prettier'); // eslint-disable-line
const readline = require('readline');
const prettierConfig = require('./prettier.config');

const BASE_URL = '/docs';

/* eslint-disable no-shadow */

const classNames = [];
const namespaces = [];
const typedefs = [];

const toId = (name) => {
    return decamelize(name, '-').replace(/\s/g, '-');
};

const getHeader = (title) => {
    const prefix = /puppeteer|social|log/.test(title) ? 'utils.' : '';
    const id = toId(title);
    return `---\nid: ${id}\ntitle: ${prefix}${title}\n---\n`;
};

const getRenderOptions = (template, data) => ({
    template,
    data,
    'name-format': true,
    separators: true,
    'param-list-format': 'list',
    'property-list-format': 'list',
    'heading-depth': 1,
    helper: [path.join(__dirname, 'helpers.js')],
    partial: [
        path.join(__dirname, 'partials', 'params-list.hbs'),
        path.join(__dirname, 'partials', 'properties-list.hbs'),
        path.join(__dirname, 'partials', 'link.hbs'),
        path.join(__dirname, 'partials', 'body.hbs'),
        path.join(__dirname, 'partials', 'docs.hbs'),
        path.join(__dirname, 'partials', 'returns.hbs'),
        path.join(__dirname, 'partials', 'sig-name.hbs'),
        path.join(__dirname, 'partials', 'header.hbs'),
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

const getLinkToEntity = (entityName, entityMap) => {
    const entity = entityMap.get(entityName);
    const folder = entity.kind === 'typedef' ? 'typedefs' : 'api';
    const id = toId(entityName);
    return `${BASE_URL}/${folder}/${id}`;
};

/**
 * Creates a regular expression that will match any entity from the provided map.
 * @param {Map} entityMap
 * @returns {RegExp}
 */
const createEntityRegex = (entityMap) => {
    const entities = Array.from(entityMap.keys())
        .sort((a, b) => b.length - a.length)
        .join('|');
    return new RegExp(entities);
};

const generateFinalMarkdown = (title, text, entityMap) => {
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
    // Remove 'module_' prefix from Apify
    text = text.replace(/module_Apify/g, 'Apify');
    // Generate correct links
    const linkRx = /(<code>)?LINK!(.*?)!LINK(<\/code>)?/g;
    const entityRx = createEntityRegex(entityMap);
    text = text.replace(linkRx, (linkToken, openTag, target, closeTag) => {
        const isHtml = !!(openTag && closeTag);
        const entityMatch = linkToken.match(entityRx);
        if (!entityMatch) {
            return isHtml ? `${openTag}${target}${closeTag}` : `\`${target}\``;
        }
        const [entity] = entityMatch;
        let link = getLinkToEntity(entity, entityMap);
        // Link to target can include method delimited by hash
        // such as RequestList.initialize => requestList.initialize()
        let caption = target;
        const [parentName, propertyName] = target.split(/[#.]/);
        if (propertyName) {
            link = `${link}#${propertyName}`;
            caption = `${parentName}.${propertyName}`;
            // Add parens to methods.
            if (target.includes('#')) caption += '()';
            // We want typedefs uppercased and class instances lowercased.
            const { kind } = entityMap.get(entity);
            caption = kind === 'class' ? `${caption[0].toLowerCase() + caption.substring(1)}` : caption;
        }
        // Normalize link to work with Docusaurus heading anchors which are lowercase
        link = link.toLowerCase();
        return isHtml
            ? `${openTag}<a href="${link}">${caption}</a>${closeTag}`
            : `[\`${caption}\`](${link})`;
    });
    // Remove annoying "new exports."
    text = text.replace(/new exports\./g, 'new ');
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
        await fs.outputFile(path.join(exampleFilesOutputDir, `${title.replace(/\s/g, '')}.md`), markdown);
    });

    await Promise.all(examplePromises);

    /* reduce templateData to an array of class names */
    templateData.forEach((identifier) => {
        if (identifier.kind === 'class' && !identifier.ignore) classNames.push(identifier.name);
        if (identifier.kind === 'namespace' && !identifier.ignore) namespaces.push(identifier.name);
        if (identifier.kind === 'typedef' && !identifier.ignore) typedefs.push(identifier.name);
    });

    // build a map of all available entities for link generation.
    // Apify needs to be added manually since its actually a module
    const entityMap = new Map();
    entityMap.set('Apify', { name: 'Apify', kind: 'namespace' });
    classNames.forEach(name => entityMap.set(name, { name, kind: 'className' }));
    namespaces.forEach(name => entityMap.set(name, { name, kind: 'namespace' }));
    typedefs.forEach(name => entityMap.set(name, { name, kind: 'typedef' }));

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
    const markdown = generateFinalMarkdown(mainModule, output, entityMap);
    await fs.outputFile(path.resolve(sourceFilesOutputDir, `${mainModule}.md`), markdown);

    // create a doc file file for each class
    const cPs = classNames.map(async (className) => {
        const template = `{{#class name="${className}"}}{{>docs}}{{/class}}`;
        console.log(`Rendering ${className}, template: ${template}`); // eslint-disable-line no-console
        const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
        const markdown = generateFinalMarkdown(className, output, entityMap);
        await fs.outputFile(path.resolve(sourceFilesOutputDir, `${className}.md`), markdown);
    });

    // create a doc file file for each namespace
    const nPs = namespaces.map(async (name) => {
        const template = `{{#namespace name="${name}"}}{{>docs}}{{/namespace}}`;
        console.log(`Rendering ${name}, template: ${template}`); // eslint-disable-line no-console
        const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
        const markdown = generateFinalMarkdown(name, output, entityMap);
        await fs.outputFile(path.resolve(sourceFilesOutputDir, `${name}.md`), markdown);
    });

    // create a doc file for each type
    const tPs = typedefs.map(async (name) => {
        const template = `{{#identifier name="${name}"}}{{>docs}}{{/identifier}}`;
        console.log(`Rendering ${name}, template: ${template}`); // eslint-disable-line no-console
        const output = jsdoc2md.renderSync(getRenderOptions(template, templateData));
        const markdown = generateFinalMarkdown(name, output, entityMap);
        await fs.outputFile(path.resolve(typeFilesOutputDir, `${name}.md`), markdown);
    });

    await Promise.all([...cPs, ...nPs, ...tPs]);
};

main().then(() => console.log('All docs built succesfully.'));
