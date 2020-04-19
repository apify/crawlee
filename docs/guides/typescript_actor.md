---
id: type-script-actor
title: TypeScript Actors
---

Apify SDK supports TypeScript by covering public APIs with type declarations. This
allows writing code with auto-completion for TypeScript and JavaScript code alike.
Besides that, actors written in TypeScript can take advantage of compile-time
type-checking and avoid many coding mistakes, while providing documentation for
functions, parameters and return values.

Setting up a TypeScript project
=============================

To use TypeScript in your actors, you'll need the following prerequisites.

1. TypeScript compiler `tsc` installed somewhere:

    ```shell script
    npm install --dev typescript
    ```

    TypeScript can be a development dependency in your project, as shown above. There's no
    need to pollute your production environment or your system's global repository
    with TypeScript.

2. A build script invoking `tsc` and a correctly specified `main` entry point defined
   in your `package.json`:

   ```json
   {
     "scripts": {
       "build": "tsc -p tsconfig.json"
     },
     "main": "build/main.js"
   }
   ```

3. Type declarations for NodeJS, so you can take advantage of type-checking in all the features you'll use:

   ```shell script
   npm install --dev @types/node
   ```

4. TypeScript configuration file allowing `tsc` to understand your project layout and
   the features used in your project:

   ```json
   {
       "compilerOptions": {
           "target": "es2018",
           "module": "commonjs",
           "moduleResolution": "node",
           "strict": true,
           "noImplicityAny": false,
           "strictNullChecks": false,
           "lib": [
               "es2018",
               "es2018.asynciterable",
               "dom",
               "dom.iterable"
           ],
           "rootDir": "src/",
           "outDir": "build/"
       },
       "include": [
           "src/"
       ]
   }
   ```

   Place the content above inside a `tsconfig.json` in your root folder.

   Also, if you are a VSCode user that is using JavaScript, create a `jsconfig.json` with the same content, adding `"checkJs": true` to `"compilerOptions"`, so you can enjoy using the types in your `.js` source files.

Auto-completion
==============

IDE auto-completion should work in most places. That's true even if you are writting
actors in pure JavaScript. For time constraints, we left out the amendment of an
internal API for the time being, and these need to be added as the SDK developers write
new and enhance old code.

SDK Documentation
=================

SDK documentation has grown a lot. There is a new API Reference section **Type definitions**
that holds documentation for all constructible types, function parameters and
return types, in the Apify SDK.

Caveats
========

As of version 0.20, the generated typings, due to JSDoc limitations, have some properties
and parameters annotated with `any` type, therefore the settings `noImplicitAny` and `strictNullChecks`, set to `true`, may not be advised. You may try enabling them, but it might hinder development because of the need for typecasts to be able to compile, your mileage may vary.

Besides the _implicit any_ errors that might occur in the code when writing in TypeScript, the
current typings doesn't offer generics that make outputs type-safe, so you need to declare your
types, as such:

```typescript
interface MySchema {
    expectedParam1?: string;
    expectedParam2?: number;
}

const input: MySchema = await Apify.getInput(); // getInput returns Promise<any> here

if (!input?.expectedParam1) { // input is MySchema now and you can check in a type-safe way
    throw new Error('Missing expectedParam1');
}
```

There are also other places where you need to explicitly provide your interface / type, like in Dataset iterators (`map`, `reduce`, `forEach`):

```typescript
interface ExpectedShape {
    id: string;
    someFields: Fields[];
}

const dataset = await Apify.openDataset();
await dataset.forEach((item: ExpectedShape) => {
    // deal with item.id / item.someFields
    // otherwise item is "any"
})
```

When using `launchPuppeteer()`, puppeteer's `LaunchOptions` needs to be
provided as an intersection using `&`, with the `LaunchPuppeteerOptions`,
so you can have all the options available:

```typescript
// manually import the types from puppeteer
import { PuppeteerOptions } from 'puppeteer'
import { LaunchPuppeteerOptions } from 'apify'

Apify.launchPuppeteer({ } as PuppeteerOptions & LaunchPuppeteerOptions)
// should show all available options intersected
```
