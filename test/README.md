# Testing in Crawlee with vitest

There are a few small differences between how testing in jest and vitest works. Mostly, they relate to what to do, and not do anymore.

## Configuration file for tests created in the package they are for

You will need to use this tsconfig.json in the `test` folder in the package (say, if you were adding a test to `packages/core` and there wasn't a `tsconfig.json` file already there)

```json
{
 "extends": "../../../tsconfig.json",
 "include": [
  "**/*",
  "../../**/*"
 ],
 "compilerOptions": {
  "types": ["vitest/globals"]
 }
}
```

## Mocking modules

#### Previous

Mocks are pretty much the same when it comes to jest vs vitest. One crucial difference is that you no longer need to unmock modules in an afterAll block, as they are mocked per test file.

```ts
jest.mock("node:os", () => {
 const original: typeof import("node:os") = jest.requireActual("node:os");
 return {
  ...original,
  platform: () => "darwin",
  freemem: jest.fn(),
 };
});

afterAll(() => {
  jest.unmock("node:os");
});
```

#### Now

```ts
vitest.mock("node:os", async (importActual) => {
  const original = await importActual<typeof import("node:os")>();
 return {
  ...original,
  platform: () => "darwin",
  freemem: jest.fn(),
 };
});
```

### Mocking based on imports

Given the following two samples:

### 1

```ts
import os from "node:os";

console.log(os.platform());
```

### 2

```ts
import { platform } from "node:os";

console.log(platform());
```

You will need to mock the module based on how you import it in the source code. This means, if you will import the default export, you will need to add a `default` property to the mocked object. Otherwise, you will need to mock the module as is.

So, for example 1:

```ts
vitest.mock("node:os", async (importActual) => {
 const original = await importActual<typeof import("node:os") & { default: typeof import("node:os") }>();

 const platformMock = () => "darwin";
 const freememMock = vitest.fn();

 return {
  ...original,
  platform: platformMock,
  freemem: freememMock,
  // Specifically, you'll need to add this v block
  default: {
   ...original.default,
   platform: platformMock,
   freemem: freememMock,
  },
 };
});
```

And for example 2:

```ts
vitest.mock("node:os", async (importActual) => {
 const original = await importActual<typeof import("node:os")>();

 const platformMock = () => "darwin";
 const freememMock = vitest.fn();

 return {
  ...original,
  platform: platformMock,
  freemem: freememMock,
 };
});
```

### Mocked functions

In previous jest code, we had to cast mocked functions as `jest.MockedFunction`. This is *technically* still needed, but vitest gives us a utility function that casts it for us: `vitest.mocked()`. It doesn't do anything runtime wise, but it helps with type inference.

```ts
import os from "node:os";

const mockedPlatform = vitest.mocked(os.platform);
```

### Resetting spies to original implementation

You no longer need to reset spies to their original implementation. This is done automatically for you via vitest's `restoreMocks` option.

With that said, if you create spies in a `beforeAll`/`beforeEach` hook, you might need to call this at the start of your file: `vitest.setConfig({ restoreMocks: false });`, as otherwise your spies will be reset before your tests run.

### Separate spy instances for methods track their own calls

In previous jest code, you could do something like this:

```ts
const spy = jest.spyOn(os, "platform").mockReturnValueOnce("darwin");

expect(os.platform()).toBe("darwin");
expect(spy).toHaveBeenCalledTimes(1);

const spy2 = jest.spyOn(os, "platform").mockReturnValueOnce("linux");

expect(os.platform()).toBe("linux");
expect(spy).toHaveBeenCalledTimes(2);
```

This is no longer valid in vitest. You will need to re-use the same spy instance.

```ts
const spy = vitest.spyOn(os, "platform").mockReturnValueOnce("darwin");

expect(os.platform()).toBe("darwin");
expect(spy).toHaveBeenCalledTimes(1);

spy.mockReturnValueOnce("linux");

expect(os.platform()).toBe("linux");
expect(spy).toHaveBeenCalledTimes(2);
```

## Changing test settings

In jest, we were able to do the following to adjust timeouts at runtime:

```ts
if (os.platform() === "win32") {
 jest.setTimeout(100_000);
}
```

In vitest, you need to call the `vitest.setConfig` function instead (and specify what to change):

```ts
if (os.platform() === "win32") {
 vitest.setConfig({
  testTimeout: 100_000,
 });
}
```

## Hook callbacks

In jest, we were able to call the callback provided in the hooks to signal the hook has executed successfully:

```ts
beforeAll((done) => {
 // Do something
 done();
});
```

In vitest, this is no longer provided, but *can* be substituted with a promise:

```ts
beforeAll(async () => {
 await new Promise(resolve => {
  // Do something
   resolve();
 });
});
```

## `const enums`

> [!IMPORTANT]
> While the built code would inline `const enum` members due to the way we compile with `tsc`, vitest uses `vite` internally which does not support `const enums`.
> It's recommended to inline the variable if the `const enum` isn't exposed at runtime (looking at you puppeteer)
