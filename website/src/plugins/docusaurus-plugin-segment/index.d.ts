declare function _exports(context: any, options: any): {
    name: string;
    getClientModules(): string[];
    injectHtmlTags(): {
        headTags?: undefined;
    } | {
        headTags: {
            tagName: string;
            innerHTML: string;
        }[];
    };
};
export = _exports;
