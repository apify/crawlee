import { readFileSync } from 'node:fs';

import { diag } from '@opentelemetry/api';

import type { ModuleDefinition } from './internal-types';
import type { ClassMethodToInstrument } from './types';

let packageFile: any;

export function getPackageJson() {
    if (!packageFile) {
        const packageFilePath = require.resolve(`@crawlee/otel/package.json`);
        packageFile = JSON.parse(readFileSync(packageFilePath, 'utf8'));
    }
    return packageFile;
}

export function getPackageVersion() {
    const packageJson = getPackageJson();
    return packageJson.version;
}

export function getCompatibleVersions() {
    return `^${getPackageVersion()}`;
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
