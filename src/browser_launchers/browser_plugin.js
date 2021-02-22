// empty class to be properly typed
export class BrowserPlugin {
    /**
     * @param {*} launcher
     * @param {Object<string, *>} context
     */
    constructor(launcher, context) {
        this.launcher = launcher;
        this.context = context;
    }

    /** @return {Promise<*>} */
    // eslint-disable-next-line no-empty-function
    async createLaunchContext() { }

    /**
     * @param {Object<string, *>} context
     * @return {Promise<*>}
     */
    // eslint-disable-next-line no-empty-function,no-unused-vars
    async launch(context) { }
}
