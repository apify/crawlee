export interface BrowserPage {
    content: () => Promise<string>;
}

export interface SnapshottableProperties {
    body?: unknown;
    page?: BrowserPage;
}
