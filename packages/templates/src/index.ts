import https from 'https';

export const MANIFEST_URL = 'https://raw.githubusercontent.com/apify/apify-ts/master/packages/templates/manifest.json';

export interface Manifest {
    templates: { name: string; description: string }[];
}

export async function fetchManifest(): Promise<Manifest> {
    return new Promise((resolve, reject) => {
        https.get(MANIFEST_URL, (res) => {
            let json = '';
            res
                .on('data', (chunk) => {
                    json += chunk;
                })
                .on('end', () => {
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
}
