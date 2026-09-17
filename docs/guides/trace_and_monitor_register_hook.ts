import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Installs the OpenTelemetry module hook, which the automatic instrumentation needs in order to patch the Crawlee
// classes as they are imported. This file must be preloaded before the OpenTelemetry setup and before the crawler.
register('@opentelemetry/instrumentation/hook.mjs', pathToFileURL('./'));
