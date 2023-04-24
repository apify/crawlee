export declare const MANIFEST_URL = "https://raw.githubusercontent.com/apify/crawlee/master/packages/templates/manifest.json";
interface SharedTemplateData {
    name: string;
    description: string;
}
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
export declare function fetchManifest(): Promise<Manifest>;
export {};
//# sourceMappingURL=index.d.ts.map