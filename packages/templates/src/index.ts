import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = resolve(__dirname, '..');
const templatesDirectory = join(packageRoot, 'templates');
const manifestPath = join(packageRoot, 'manifest.json');

export const MANIFEST_URL = pathToFileURL(manifestPath).toString();

function templateFileUrl(templateName: string, path: string) {
    return pathToFileURL(join(templatesDirectory, templateName, path)).toString();
}

interface SharedTemplateData {
    name: string;
    description: string;
}

// Data loaded from the packaged manifest file
interface RawTemplate extends SharedTemplateData {
    files: string[];
}

interface RawManifest {
    templates: RawTemplate[];
}

// Data returned for the CLI or users to consume
export interface TemplateFile {
    path: string;
    url: string;
}

export interface Template extends SharedTemplateData {
    files: TemplateFile[];
}

export interface Manifest {
    templates: Template[];
}

export async function fetchManifest(): Promise<Manifest> {
    const rawManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as RawManifest;

    const newTemplates: Template[] = rawManifest.templates.map((original) => {
        return {
            name: original.name,
            description: original.description,
            files: original.files.map((file) => ({
                path: file,
                url: templateFileUrl(original.name, file),
            })),
        };
    });

    return {
        templates: newTemplates,
    };
}
