import https from 'https';

export const MANIFEST_URL = 'https://raw.githubusercontent.com/apify/crawlee/master/packages/templates/manifest.json';

function templateFileUrl(templateName: string, path: string) {
    return `https://raw.githubusercontent.com/apify/crawlee/master/packages/templates/templates/${templateName}/${path}`;
}

interface SharedTemplateData {
    name: string;
    description: string;
}

// Data received from the github file
interface RawTemplate extends SharedTemplateData {
    files: string[];
}

interface RawManifest {
    templates: RawTemplate[];
}

// Data returned for the CLI or users to consume
export interface Manifest {
    templates: Template[];
}

export interface Template extends SharedTemplateData {
    files: TemplateFile[];
}

export interface TemplateFile {
    path: string;
    url: string;
}

export async function fetchManifest(): Promise<Manifest> {
    const rawManifest = await new Promise<RawManifest>((resolve, reject) => {
        https.get(MANIFEST_URL, (res) => {
            let json = '';
            res
                .on('data', (chunk) => {
                    json += chunk;
                })
                .once('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const data = JSON.parse(json);
                            resolve(data);
                        } catch (e) {
                            reject(e);
                        }
                    } else {
                        reject(new Error(`Status: ${res.statusCode}\n${json}`));
                    }
                })
                .on('error', (err) => reject(err));
        })
            .on('error', (err) => reject(err));
    });

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
