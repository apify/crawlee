# Contributing

When contributing to this repository, please first discuss the change you wish to make via issue,
email, or any other method with the owners of this repository before making a change.

Please note we have a code of conduct, please follow it in all your interactions with the project.

## Pull Request Process

1. Ensure any install or build dependencies are removed before the end of the layer when doing a
   build.
2. Update the README.md and CHANGELOG.md with details of changes to the interface, this includes new environment
   variables, exposed ports, useful file locations and container parameters.
3. Increase the version numbers in any examples files and the README.md to the new version that this
   Pull Request would represent. The versioning scheme we use is [SemVer](http://semver.org/).
4. You may merge the Pull Request in once you have the sign-off of two other developers, or if you
   do not have permission to do that, you may request the second reviewer to merge it for you.

### Yarn

This project now uses yarn v3 to manage dependencies. You will need to install it, the easiest way is by using `corepack`:

```shell
corepack enable
```

### macOS

Our proxy tests use different loopback addresses to ensure traffic correctness.
In contrary to Windows and Linux, macOS comes with only one loopback address - `127.0.0.1`.
Therefore it is necessary to run the following once per system startup:

```
sudo ifconfig lo0 alias 127.0.0.2 up
sudo ifconfig lo0 alias 127.0.0.3 up
sudo ifconfig lo0 alias 127.0.0.4 up
```

### Arch linux

Arch linux is [not officially supported](https://github.com/microsoft/playwright/issues/8100) by Playwright, which causes problems in tests. You need to install dependencies manually:

```
yay -S libffi7 icu66 libwebp052 flite-unpatched
sudo ln -s /usr/lib/libpcre.so /usr/lib/libpcre.so.3
```

## Testing in Crawlee with vitest

There are a few small differences between how testing in jest and vitest works. Mostly, they relate to what to do, and not do anymore.

### Configuration file for tests created in the package they are for

You will need to use this tsconfig.json in the `test` folder in the package (say, if you were adding a test to `packages/core` and there wasn't a `tsconfig.json` file already there)

```json
{
    "extends": "../../../tsconfig.json",
    "include": ["**/*", "../../**/*"],
    "compilerOptions": {
        "types": ["vitest/globals"]
    }
}
```

### Mocking modules

Mocks are pretty much the same when it comes to jest vs vitest. One crucial difference is that you no longer need to unmock modules in an afterAll block, as they are mocked per test file.

#### Previous

```ts
jest.mock('node:os', () => {
    const original: typeof import('node:os') = jest.requireActual('node:os');
    return {
        ...original,
        platform: () => 'darwin',
        freemem: jest.fn(),
    };
});

afterAll(() => {
    jest.unmock('node:os');
});
```

#### Now

```ts
vitest.mock('node:os', async (importActual) => {
    const original = await importActual<typeof import('node:os')>();
    return {
        ...original,
        platform: () => 'darwin',
        freemem: jest.fn(),
    };
});
```

### Mocking based on imports

Given the following two samples:

#### 1

```ts
import os from 'node:os';

console.log(os.platform());
```

#### 2

```ts
import { platform } from 'node:os';

console.log(platform());
```

You will need to mock the module based on how you import it in the source code. This means, if you will import the default export, you will need to add a `default` property to the mocked object. Otherwise, you will need to mock the module as is.

So, for example 1:

```ts
vitest.mock('node:os', async (importActual) => {
    const original = await importActual<
        typeof import('node:os') & { default: typeof import('node:os') }
    >();

    const platformMock = () => 'darwin';
    const freememMock = vitest.fn();

    return {
        ...original,
        platform: platformMock,
        freemem: freememMock,
        // Specifically, you'll need to also mock the `default` property of the module, as seen below
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
vitest.mock('node:os', async (importActual) => {
    const original = await importActual<typeof import('node:os')>();

    const platformMock = () => 'darwin';
    const freememMock = vitest.fn();

    return {
        ...original,
        platform: platformMock,
        freemem: freememMock,
    };
});
```

### Mocked functions

In previous jest code, we had to cast mocked functions as `jest.MockedFunction`. This is _technically_ still needed, but vitest gives us a utility function that casts it for us: `vitest.mocked()`. It doesn't do anything runtime wise, but it helps with type inference.

```ts
import os from 'node:os';

const mockedPlatform = vitest.mocked(os.platform);
```

### Resetting spies to original implementation

You no longer need to reset spies to their original implementation. This is done automatically for you via vitest's `restoreMocks` option.

With that said, if you create spies in a `beforeAll`/`beforeEach` hook, you might need to call this at the start of your file: `vitest.setConfig({ restoreMocks: false });`, as otherwise your spies will be reset before your tests run.

### Separate spy instances for methods track their own calls

In previous jest code, you could do something like this:

```ts
const spy = jest.spyOn(os, 'platform').mockReturnValueOnce('darwin');

expect(os.platform()).toBe('darwin');
expect(spy).toHaveBeenCalledTimes(1);

const spy2 = jest.spyOn(os, 'platform').mockReturnValueOnce('linux');

expect(os.platform()).toBe('linux');
expect(spy).toHaveBeenCalledTimes(2);
```

This is no longer valid in vitest. You will need to re-use the same spy instance.

```ts
const spy = vitest.spyOn(os, 'platform').mockReturnValueOnce('darwin');

expect(os.platform()).toBe('darwin');
expect(spy).toHaveBeenCalledTimes(1);

spy.mockReturnValueOnce('linux');

expect(os.platform()).toBe('linux');
expect(spy).toHaveBeenCalledTimes(2);
```

## Changing test settings

In jest, we were able to do the following to adjust timeouts at runtime:

```ts
if (os.platform() === 'win32') {
    jest.setTimeout(100_000);
}
```

In vitest, you need to call the `vitest.setConfig` function instead (and specify what to change):

```ts
if (os.platform() === 'win32') {
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

In vitest, this is no longer provided, but _can_ be substituted with a promise:

```ts
beforeAll(async () => {
    await new Promise((resolve) => {
        // Do something
        resolve();
    });
});
```

## `const enums`

> [!IMPORTANT]
> Certain projects, like `puppeteer` declare `const enum`s in their typings. These are enums that do not actually exist at runtime, but enums that `tsc` (which is what we're currently using to compile Crawlee) can inline the values of
> directly into the compiled code. You should avoid importing `const enums` as `vitest` will not inline them like `tsc` does and will throw an error, unless the enum is also present at runtime (check by importing the module and seeing if it's exported anywhere).

## Testing for class names in stack traces

Some tests may want to check for error stack traces and the presence of class names (a prime example is our tests for logging the stack traces for certain logger levels). In `jest`, you were able to do this:

```ts
expect(/at BasicCrawler\.requestHandler/.test(stackTrace)).toBe(true);
```

In `vitest`, at the time of writing this (2023/10/12), class names get an `_` prepended to them. In order to solve this, just add `_?` to your regular expression test (this will match both with and without the `_`).

```ts
expect(/at _?BasicCrawler\.requestHandler/.test(stackTrace)).toBe(true);
```

## Code of Conduct

### Our Pledge

In the interest of fostering an open and welcoming environment, we as
contributors and maintainers pledge to making participation in our project and
our community a harassment-free experience for everyone, regardless of age, body
size, disability, ethnicity, gender identity and expression, level of experience,
nationality, personal appearance, race, religion, or sexual identity and
orientation.

### Our Standards

Examples of behavior that contributes to creating a positive environment
include:

-   Using welcoming and inclusive language
-   Being respectful of differing viewpoints and experiences
-   Gracefully accepting constructive criticism
-   Focusing on what is best for the community
-   Showing empathy towards other community members

Examples of unacceptable behavior by participants include:

-   The use of sexualized language or imagery and unwelcome sexual attention or
    advances
-   Trolling, insulting/derogatory comments, and personal or political attacks
-   Public or private harassment
-   Publishing others' private information, such as a physical or electronic
    address, without explicit permission
-   Other conduct which could reasonably be considered inappropriate in a
    professional setting

### Our Responsibilities

Project maintainers are responsible for clarifying the standards of acceptable
behavior and are expected to take appropriate and fair corrective action in
response to any instances of unacceptable behavior.

Project maintainers have the right and responsibility to remove, edit, or
reject comments, commits, code, wiki edits, issues, and other contributions
that are not aligned to this Code of Conduct, or to ban temporarily or
permanently any contributor for other behaviors that they deem inappropriate,
threatening, offensive, or harmful.

### Scope

This Code of Conduct applies both within project spaces and in public spaces
when an individual is representing the project or its community. Examples of
representing a project or community include using an official project e-mail
address, posting via an official social media account, or acting as an appointed
representative at an online or offline event. Representation of a project may be
further defined and clarified by project maintainers.

### Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be
reported by contacting the project team at <support@apify.com>. All
complaints will be reviewed and investigated and will result in a response that
is deemed necessary and appropriate to the circumstances. The project team is
obligated to maintain confidentiality with regard to the reporter of an incident.
Further details of specific enforcement policies may be posted separately.

Project maintainers who do not follow or enforce the Code of Conduct in good
faith may face temporary or permanent repercussions as determined by other
members of the project's leadership.

### Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage], version 1.4,
available at [http://contributor-covenant.org/version/1/4][version],
and from [PurpleBooth](https://gist.github.com/PurpleBooth/b24679402957c63ec426).

[homepage]: http://contributor-covenant.org
[version]: http://contributor-covenant.org/version/1/4/
