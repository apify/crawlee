"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancePageWithStagehand = enhancePageWithStagehand;
const PROVIDER_ENV_VARS = {
    OpenAI: 'OPENAI_API_KEY',
    Anthropic: 'ANTHROPIC_API_KEY',
    Google: 'GOOGLE_API_KEY',
};
/**
 * Improves error messages for common Stagehand errors.
 * Replaces confusing Stagehand API key error messages with ones that reference our options.
 */
function improveErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    // Improve API key error messages to reference our options
    if (message.includes('API key is missing')) {
        let provider = 'LLM provider';
        for (const name of Object.keys(PROVIDER_ENV_VARS)) {
            if (message.includes(name)) {
                provider = name;
                break;
            }
        }
        const envVar = PROVIDER_ENV_VARS[provider] ?? '<PROVIDER>_API_KEY';
        return `${provider} API key is missing. Pass it via 'stagehandOptions.apiKey' or set the ${envVar} environment variable.`;
    }
    return message;
}
/**
 * Enhances a Playwright Page with Stagehand AI methods.
 * Adds page.act(), page.extract(), page.observe(), and page.agent() methods.
 *
 * The key feature is that each AI method passes the specific page to Stagehand,
 * allowing multiple pages to use AI operations concurrently without interference.
 *
 * @param page - The Playwright page to enhance
 * @param stagehand - The Stagehand instance to bind methods from
 * @returns The enhanced page with AI methods
 *
 * @example
 * ```typescript
 * const enhancedPage = enhancePageWithStagehand(page, stagehand);
 * await enhancedPage.act('Click the button');
 * const data = await enhancedPage.extract('Get title', schema);
 * ```
 *
 * @ignore
 */
function enhancePageWithStagehand(page, stagehand) {
    // Cast to StagehandPage to add properties
    const enhancedPage = page;
    /**
     * Perform an action on the page using natural language.
     * Passes this specific page to Stagehand so it operates on the correct page.
     */
    enhancedPage.act = async (instruction, options) => {
        try {
            // Pass the page option to ensure Stagehand operates on this specific page
            // Cast needed because Stagehand types reference older playwright-core versions
            return await stagehand.act(instruction, { ...options, page: page });
        }
        catch (error) {
            throw new Error(`Stagehand act() failed: ${improveErrorMessage(error)}`, {
                cause: error,
            });
        }
    };
    /**
     * Extract structured data from the page using natural language and a Zod schema.
     * Passes this specific page to Stagehand so it operates on the correct page.
     */
    enhancedPage.extract = async (instruction, schema, options) => {
        try {
            // Pass the page option to ensure Stagehand operates on this specific page
            // Cast needed because Stagehand types reference older playwright-core versions
            return await stagehand.extract(instruction, schema, { ...options, page: page });
        }
        catch (error) {
            throw new Error(`Stagehand extract() failed: ${improveErrorMessage(error)}`, {
                cause: error,
            });
        }
    };
    /**
     * Observe the page and get AI-suggested actions.
     * Passes this specific page to Stagehand so it operates on the correct page.
     */
    enhancedPage.observe = async (options) => {
        try {
            // Pass the page option to ensure Stagehand operates on this specific page
            // Cast needed because Stagehand types reference older playwright-core versions
            return await stagehand.observe({ ...options, page: page });
        }
        catch (error) {
            throw new Error(`Stagehand observe() failed: ${improveErrorMessage(error)}`, {
                cause: error,
            });
        }
    };
    /**
     * Create an autonomous agent for multi-step workflows.
     * Note: Agent operates on the page context.
     *
     * The `as any` cast is needed because stagehand.agent() has two overloaded signatures
     * (streaming vs non-streaming) that TypeScript struggles to reconcile when assigning
     * to a property.
     */
    enhancedPage.agent = (config) => {
        try {
            if (config?.stream === true) {
                return stagehand.agent(config);
            }
            return stagehand.agent(config);
        }
        catch (error) {
            throw new Error(`Stagehand agent() failed: ${improveErrorMessage(error)}`, {
                cause: error,
            });
        }
    };
    return enhancedPage;
}
