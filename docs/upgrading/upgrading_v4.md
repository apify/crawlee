---
id: upgrading-to-v4
title: Upgrading to v4
---

import ApiLink from '@site/src/components/ApiLink';

This page summarizes most of the breaking changes in Crawlee v4.

## ECMAScript modules

Crawlee v4 is a native ESM package now. It can be still consumed from a CJS project, as long as you use TypeScript and Node.js version that supports `require(esm)`.

## Node 22+ required

Support for older node versions was dropped.

## TypeScript 5.8+ required

Support for older TypeScript versions was dropped. Older versions might work too, but only if your project is also ESM.

## Cheerio v1

Previously, we kept the dependency on cheerio locked to the latest RC version, since there were many breaking changes introduced in v1.0. This release bumps cheerio to the stable v1. Also, we now use the default `parse5` internally.
