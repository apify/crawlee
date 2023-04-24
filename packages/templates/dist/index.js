"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchManifest = exports.MANIFEST_URL = void 0;
const tslib_1 = require("tslib");
const https_1 = tslib_1.__importDefault(require("https"));
exports.MANIFEST_URL = 'https://raw.githubusercontent.com/apify/crawlee/master/packages/templates/manifest.json';
function templateFileUrl(templateName, path) {
    return `https://raw.githubusercontent.com/apify/crawlee/master/packages/templates/templates/${templateName}/${path}`;
}
async function fetchManifest() {
    const rawManifest = await new Promise((resolve, reject) => {
        https_1.default.get(exports.MANIFEST_URL, (res) => {
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
                    }
                    catch (e) {
                        reject(e);
                    }
                }
                else {
                    reject(new Error(`Status: ${res.statusCode}\n${json}`));
                }
            })
                .on('error', (err) => reject(err));
        })
            .on('error', (err) => reject(err));
    });
    const newTemplates = rawManifest.templates.map((original) => {
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
exports.fetchManifest = fetchManifest;
//# sourceMappingURL=index.js.map