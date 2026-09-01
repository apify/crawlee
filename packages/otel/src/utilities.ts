import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { diag } from '@opentelemetry/api';
import type { LogAttributes } from '@opentelemetry/api-logs';
import {
    ATTR_EXCEPTION_MESSAGE,
    ATTR_EXCEPTION_STACKTRACE,
    ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';

import { PACKAGE_NAME, UNKNOWN_PACKAGE_VERSION } from './constants.js';
import type { ModuleDefinition } from './internal-types.js';
import type { ClassMethodToInstrument } from './types.js';

interface OtelPackageJson {
    version: string;
}

let packageFile: OtelPackageJson | undefined;

function getPackageJson(): OtelPackageJson {
    if (!packageFile) {
        try {
            // The package is ESM, so `require` has to be recreated from the module URL.
            const packageFilePath = createRequire(import.meta.url).resolve(`${PACKAGE_NAME}/package.json`);
            packageFile = JSON.parse(readFileSync(packageFilePath, 'utf8')) as OtelPackageJson;
        } catch (err) {
            // The version is only reported as the instrumentation scope version, so a failure here must not be fatal.
            diag.warn(`Could not determine the ${PACKAGE_NAME} version: ${err}`);
            packageFile = { version: UNKNOWN_PACKAGE_VERSION };
        }
    }
    return packageFile;
}

export function getPackageVersion(): string {
    return getPackageJson().version;
}

/**
 * Turns the structured `data` of a Crawlee log call into OpenTelemetry log attributes.
 *
 * Crawlee folds a logged error into `data`, so any `Error` value found there is mapped onto the semantic convention
 * attributes - its own properties are not enumerable and would otherwise be dropped.
 */
export function buildLogAttributes(data?: unknown): LogAttributes {
    const attributes: LogAttributes = {};

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        if (data !== undefined) {
            attributes['crawlee.log.data'] = String(data);
        }
        return attributes;
    }

    for (const [key, value] of Object.entries(data)) {
        if (value instanceof Error) {
            attributes[ATTR_EXCEPTION_TYPE] = value.name;
            attributes[ATTR_EXCEPTION_MESSAGE] = value.message;
            if (value.stack) {
                attributes[ATTR_EXCEPTION_STACKTRACE] = value.stack;
            }
        } else {
            attributes[key] = value as LogAttributes[string];
        }
    }

    return attributes;
}

/**
 * Groups the methods to instrument by the module that owns them, dropping duplicates.
 *
 * The first definition of a method wins. `CrawleeInstrumentation` passes `customInstrumentation` ahead of the built-in
 * list, so configuring a method that is already instrumented overrides the built-in span rather than being ignored.
 */
export function buildModuleDefinitions(methodsToInstrument: ClassMethodToInstrument[]): ModuleDefinition[] {
    const definitions: ModuleDefinition[] = [];

    for (const method of methodsToInstrument) {
        let definition = definitions.find((d) => d.moduleName === method.moduleName);
        if (!definition) {
            if (!method.moduleName.startsWith('@crawlee/')) {
                diag.warn(`Module ${method.moduleName} is not a valid Crawlee module. Skipping.`);
                continue;
            }
            definition = {
                moduleName: method.moduleName,
                classMethodPatches: [],
            };
            definitions.push(definition);
        }
        if (
            !definition.classMethodPatches.find(
                (p) => p.className === method.className && p.methodName === method.methodName,
            )
        ) {
            definition.classMethodPatches.push({
                className: method.className,
                methodName: method.methodName,
                spanName: method.spanName,
                spanOptions: method.spanOptions,
            });
        } else {
            diag.warn(
                `Method ${method.className}.${method.methodName} is instrumented more than once. Keeping the first ` +
                    `definition, which is the \`customInstrumentation\` entry when one exists for the method.`,
            );
        }
    }
    return definitions;
}
