import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const skills = new URL('../src/skills/', import.meta.url);
const bundled = new URL('../dist/skills/', import.meta.url);
const docs = new URL('../../../docs/upgrading/', import.meta.url);

cpSync(skills, bundled, { recursive: true });

// Each `crawlee-upgrade-v<major>` skill ships the website's upgrade guide for that major as `guide/`.
for (const skill of readdirSync(skills)) {
    const major = /^crawlee-upgrade-v(\d+)$/.exec(skill)?.[1];
    if (!major) continue;

    const guide = new URL(`upgrading-v${major}/`, docs);
    const target = new URL(`${skill}/guide/`, bundled);
    mkdirSync(target, { recursive: true });

    for (const page of readdirSync(guide)) {
        if (!page.endsWith('.md')) continue;
        const markdown = readFileSync(new URL(page, guide), 'utf8')
            // The website's MDX components do not render outside of it.
            .replace(/^import .+ from '@site\/.+;\r?\n\r?\n?/m, '')
            .replace(/<ApiLink [^>]*>(.*?)<\/ApiLink>/g, '$1')
            // Pages outside the guide are not bundled, so link to the published ones.
            .replace(
                /\]\((?:\.\.\/)+([^)#]+?)(?:\.mdx?)?(#[^)]*)?\)/g,
                (_, path, hash = '') => `](https://crawlee.dev/js/docs/next/${path}${hash})`,
            );
        writeFileSync(new URL(page, target), markdown);
    }
}
