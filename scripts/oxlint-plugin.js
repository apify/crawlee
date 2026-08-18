/**
 * Local oxlint JS plugin. Loaded via `jsPlugins` in `oxlint.config.ts`.
 */
export const preferPrivateFields = {
    meta: {
        messages: {
            preferHash: 'Use a native `#private` field instead of the TypeScript `private` modifier.',
        },
    },
    // `createOnce` is oxlint's faster alternative to ESLint's `create`; safe here because the rule
    // keeps no per-file state.
    createOnce(context) {
        return {
            'PropertyDefinition[accessibility="private"], MethodDefinition[accessibility="private"], TSAbstractPropertyDefinition[accessibility="private"], TSAbstractMethodDefinition[accessibility="private"], TSParameterProperty[accessibility="private"]'(node) {
                context.report({ node: 'key' in node ? node.key : node, messageId: 'preferHash' });
            },
        };
    },
};
export default {
    meta: { name: 'crawlee' },
    rules: { 'prefer-private-fields': preferPrivateFields },
};
