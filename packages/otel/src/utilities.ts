import { readFileSync } from 'node:fs';

import { diag } from '@opentelemetry/api';
import type { LogAttributes } from '@opentelemetry/api-logs';
import {
    ATTR_EXCEPTION_MESSAGE,
    ATTR_EXCEPTION_STACKTRACE,
    ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';

import { PACKAGE_NAME, UNKNOWN_PACKAGE_VERSION } from './constants';
import type { ModuleDefinition } from './internal-types';
import type { ClassMethodToInstrument } from './types';

interface OtelPackageJson {
    version: string;
}

let packageFile: OtelPackageJson | undefined;

function getPackageJson(): OtelPackageJson {
    if (!packageFile) {
        try {
            const packageFilePath = require.resolve(`${PACKAGE_NAME}/package.json`);
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
 * Turns the `data` and `exception` arguments of `@apify/log` into OpenTelemetry log attributes.
 * Errors are mapped onto the semantic convention attributes, because their own properties are not enumerable
 * and would be dropped by a plain object spread.
 */
export function buildLogAttributes(data?: unknown, exception?: unknown): LogAttributes {
    const attributes: LogAttributes = {};

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        Object.assign(attributes, data);
    } else if (data !== undefined) {
        attributes['crawlee.log.data'] = String(data);
    }

    if (exception instanceof Error) {
        attributes[ATTR_EXCEPTION_TYPE] = exception.name;
        attributes[ATTR_EXCEPTION_MESSAGE] = exception.message;
        if (exception.stack) {
            attributes[ATTR_EXCEPTION_STACKTRACE] = exception.stack;
        }
    } else if (exception !== undefined) {
        attributes[ATTR_EXCEPTION_MESSAGE] = String(exception);
    }

    return attributes;
}

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
            diag.warn(`Method ${method.className}.${method.methodName} is already instrumented. Skipping.`);
            continue;
        }
    }
    return definitions;
}
