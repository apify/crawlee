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

type AttributeValue =
    | string
    | number
    | boolean
    | (null | undefined | string)[]
    | (null | undefined | number)[]
    | (null | undefined | boolean)[];

function isPrimitive(v: unknown): v is string | number | boolean {
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function isValidArray(v: unknown): v is AttributeValue {
    if (!Array.isArray(v)) return false;

    let seenType: 'string' | 'number' | 'boolean' | null = null;

    for (const item of v) {
        if (item === null || item === undefined) continue;

        if (!isPrimitive(item)) return false;

        const t = typeof item;
        if (seenType === null) {
            seenType = t as 'string' | 'number' | 'boolean';
        } else if (seenType !== t) {
            // mixed primitive arrays are NOT allowed by OTEL
            return false;
        }
    }

    return true;
}

export function toOtelAttributeValue(value: unknown): AttributeValue {
    if (isPrimitive(value)) {
        return value;
    }

    if (isValidArray(value)) {
        return value;
    }

    try {
        return JSON.stringify(value) || String(value);
    } catch {
        return String(value);
    }
}

export function buildModuleDefinitions(methodsToInstrument: ClassMethodToInstrument[]): ModuleDefinition[] {
    const definitions: ModuleDefinition[] = [];

    for (const method of methodsToInstrument) {
      let definition = definitions.find(d => d.moduleName === method.moduleName);
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
      if (!definition.classMethodPatches.find(p => p.className === method.className && p.methodName === method.methodName)) {
        definition.classMethodPatches.push({
          className: method.className,
          methodName: method.methodName,
          onInvokeHook: method.onInvokeHook,
          onSpanStartHook: method.onSpanStartHook,
          onSpanEndHook: method.onSpanEndHook,
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