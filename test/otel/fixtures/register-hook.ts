import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Identical to the guide's own hook file: this is the delivery mechanism the automatic instrumentation depends on,
// and the only reason this fixture exists as a separate preload is that ESM imports are hoisted.
register('@opentelemetry/instrumentation/hook.mjs', pathToFileURL('./'));
