---
id: typescriptactor
title: Typescript Actors
---

Apify SDK supports Typescript by covering public APIs with type declarations. This
allows writing code with auto-completion for Typedcript and Javascript code alike.
Besides that, actors written in Typescript can take advantage of compile-time
type-checking and avoid many mistakes.

Setting up Typescript project
=============================

To use Typescript in your actors, you'll need the following prerequisities.

1. Typescript compiler `tsc` installed somewhere:

    ```shell script
    npm install --dev typescript
    ```

    Type can be a development dependency in your project, as shown above. There's no
    need to pollute your production environment or your system's package repository
    with Typescript.

2. A build script invoking `tsc` and a correctly specified `main` entry point defined
   in your `package.json`:

   ```json
   {
     "scripts": {
       "build": "tsc"
     },
     "main": "build/main.js"
   }
   ```

3. Type declarations for NodeJS, and optionally Cheerio, or Puppeteer (or both), so
   you can take advantage of type-checking in all the features you'll use:

   ```shell script
   npm install --dev @types/node
   npm install --dev @types/cheerio
   npm install --dev @types/puppeteer
   ```

   If you're using other Javascript packages in your actor, you'll want to include their
   type declarations too (if they are available).

4. Typescript configuration file allowing `tsc` to understand your project layout and
   the features used in your project and a targeted language level:

   ```json
   {
       "compilerOptions": {
           "target": "es2018",
           "module": "commonjs",
           "moduleResolution": "node",
           "lib": [
               "es2018",
               "es2018.asynciterable",
               "dom",
               "dom.iterable"
           ],
           "types": [
               "node",
               "cheerio"
           ],
           "esModuleInterop": true,
           "outDir": "build/"
       },
       "include": [
           "src/"
       ]
   }
   ```

   NOTE: You'll need to mention `cheerio` in `tsconfig.json` explicitly, but you don't
   need to do so for `puppeteer`. The reason is that the `cheerio` module exports only
   one function. Puppeteer's type declarations explicitly export all the types required.

Auto-completion
==============

IDE auto-completion should work in most places. That's true even if you are writting
actors in pure Javascript. For time constraints, we left out the amendment of an
internal API for the time being, and these need to be added as SDK developers write
new and enhance old code.

SDK Documentation
=================

SDK documentation has grown a lot. There is a new API Reference section and one
sub-section:

- **Compiler options** in the **Type definitions** sidebar - Holds documentation for
  all constructible types in SDK.
- **User-Functions** sidebar - Holds documentation for user-provided functions like
  `CheerioHandlePage`, `PuppeteerHandlePage`, `DatasetConsumer`, `DatasetMapper`, etc.
  and their associated value-types `CheerioHandlePageInput`, etc.

Expanding and enhancing documentation in those new places and adding more
details may be a potential priority.

Problems
========

Typescript sometimes generates invalid or incorrect declarations from JSDoc comments
until Typescript developers fix these problems. This needs to be handled in the future,
though all critical errors have been avoided or fixed already. Examples:

- Typescript does not handle `@extends` and `@typedef {BaseType}` as expected
- In `types/session_pool/session_pool.d.ts`, it adds methods from the base-class
  `EventEmitter` and changes their return types, so they are not compatible with the
  `EventEmitter` (i.e., `addListener(): SessionPool`, instead of `addListener(): this`).

How to `launchPuppeteer()`
==========================

We are not able to `@extend` puppeteer's `LaunchOptions` as mentioned above and
JSDoc considers intersection types a syntactic error.
For this reason we left out the original launch options from our declarations and
let users to handle types in his code.

You can just cast a as PuppeteerOptions after the object, as such:

```typescript
// manually import the types from puppeteer
import { PuppeteerOptions } from 'puppeteer'
import { LaunchPuppeteerOptions } from 'apify'

Apify.launchPuppeteer({ } as PuppeteerOptions & LaunchPuppeteerOptions)
// should show all available options intersected
```

or slap an `as any` for limited time
