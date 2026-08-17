/**
 * Local oxlint JS plugin. Loaded via `jsPlugins` in `oxlint.config.ts`.
 */

import type { ESTree, Plugin, Rule } from '@oxlint/plugins';

// `PropertyDefinition`/`MethodDefinition` also cover their `TSAbstract*` variants — oxlint models
// those as the same node shape with a different `type`, which is why the selector lists both.
type PrivateMember = ESTree.PropertyDefinition | ESTree.MethodDefinition | ESTree.TSParameterProperty;

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
            'PropertyDefinition[accessibility="private"], MethodDefinition[accessibility="private"], TSAbstractPropertyDefinition[accessibility="private"], TSAbstractMethodDefinition[accessibility="private"], TSParameterProperty[accessibility="private"]'(
                node: PrivateMember,
            ) {
                context.report({ node: 'key' in node ? node.key : node, messageId: 'preferHash' });
            },
        };
    },
} satisfies Rule;

export default {
    meta: { name: 'crawlee' },
    rules: { 'prefer-private-fields': preferPrivateFields },
} satisfies Plugin;
