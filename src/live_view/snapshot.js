/**
 * Represents a live view snapshot to be served by {@link LiveViewServer}.
 * @property {String} pageUrl
 * @property {String} htmlContent
 * @property {Number} screenshotIndex
 * @property {Date} createdAt
 * @ignore
 */
export default class Snapshot {
    /**
     * @param {Object} props
     * @param {String} props.pageUrl
     * @param {String} props.htmlContent
     * @param {Number} props.screenshotIndex
     */
    constructor(props) {
        this.pageUrl = props.pageUrl;
        this.htmlContent = props.htmlContent;
        this.screenshotIndex = props.screenshotIndex;
        this.createdAt = new Date();
    }

    /**
     * @return {Number}
     */
    age() {
        return Date.now() - this.createdAt;
    }
}
