/**
 * Represents a live view snapshot to be served by {@link LiveViewServer}.
 * @property {string} pageUrl
 * @property {string} htmlContent
 * @property {number} screenshotIndex
 * @property {Date} createdAt
 * @ignore
 */
export default class Snapshot {
    /**
     * @param {Object} props
     * @param {string} props.pageUrl
     * @param {string} props.htmlContent
     * @param {number} props.screenshotIndex
     */
    constructor(props: {
        pageUrl: string;
        htmlContent: string;
        screenshotIndex: number;
    });
    pageUrl: string;
    htmlContent: string;
    screenshotIndex: number;
    createdAt: Date;
    /**
     * @return {number}
     */
    age(): number;
}
