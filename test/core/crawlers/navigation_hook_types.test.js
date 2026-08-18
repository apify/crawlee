describe('navigation hook option types (#2063)', () => {
    test('puppeteer - hooks with explicitly typed context stay assignable', () => {
        const preNavigationHook = async ({ request, gotoOptions }) => {
            void request.userData.label;
            gotoOptions.timeout = 60_000;
        };
        const postNavigationHook = async ({ request }) => void request.userData.label;
        const options = {
            preNavigationHooks: [preNavigationHook],
            postNavigationHooks: [postNavigationHook],
        };
        expect(options).toBeTruthy();
    });
    test('puppeteer - hooks typed via the PuppeteerHook generic', () => {
        const hook = async ({ request }) => void request.userData.label;
        const options = {
            preNavigationHooks: [hook],
            postNavigationHooks: [hook],
        };
        expect(options).toBeTruthy();
    });
    test('playwright - hooks with explicitly typed context stay assignable', () => {
        const preNavigationHook = async ({ request, gotoOptions }) => {
            void request.userData.label;
            gotoOptions.timeout = 60_000;
        };
        const postNavigationHook = async ({ request }) => void request.userData.label;
        const options = {
            preNavigationHooks: [preNavigationHook],
            postNavigationHooks: [postNavigationHook],
        };
        expect(options).toBeTruthy();
    });
    test('playwright - hooks typed via the PlaywrightHook generic', () => {
        const hook = async ({ request }) => void request.userData.label;
        const options = {
            preNavigationHooks: [hook],
            postNavigationHooks: [hook],
        };
        expect(options).toBeTruthy();
    });
    test('stagehand - hooks with explicitly typed context stay assignable', () => {
        const preNavigationHook = async ({ request, gotoOptions }) => {
            void request.userData.label;
            gotoOptions.timeout = 60_000;
        };
        const postNavigationHook = async ({ request }) => void request.userData.label;
        const options = {
            preNavigationHooks: [preNavigationHook],
            postNavigationHooks: [postNavigationHook],
        };
        expect(options).toBeTruthy();
    });
    test('stagehand - hooks typed via the StagehandHook generic', () => {
        const hook = async ({ request }) => void request.userData.label;
        const options = {
            preNavigationHooks: [hook],
            postNavigationHooks: [hook],
        };
        expect(options).toBeTruthy();
    });
    test('cheerio - pre-navigation hook typed with custom user data stays assignable', () => {
        const hook = async ({ request }) => void request.userData.label;
        const options = {
            preNavigationHooks: [hook],
        };
        expect(options).toBeTruthy();
    });
});
describe('request handler option types (#2063)', () => {
    test('playwright - request handler typed with custom user data stays assignable', () => {
        const requestHandler = async ({ request }) => void request.userData.label;
        const options = { requestHandler };
        expect(options).toBeTruthy();
    });
    test('puppeteer - request handler typed with custom user data stays assignable', () => {
        const requestHandler = async ({ request }) => void request.userData.label;
        const options = { requestHandler };
        expect(options).toBeTruthy();
    });
    test('stagehand - request handler typed with custom user data stays assignable', () => {
        const requestHandler = async ({ request }) => void request.userData.label;
        const options = { requestHandler };
        expect(options).toBeTruthy();
    });
});
describe('hooks with a crawler-level typed context (#2063)', () => {
    test('playwright - hooks receive the user data typed via the options generic', () => {
        const options = {
            requestHandler: async ({ request }) => {
                expectTypeOf(request.userData).toEqualTypeOf();
            },
            preNavigationHooks: [
                async ({ request, gotoOptions }) => {
                    expectTypeOf(request.userData).toEqualTypeOf();
                    void gotoOptions;
                },
            ],
            postNavigationHooks: [
                async ({ request }) => {
                    expectTypeOf(request.userData).toEqualTypeOf();
                },
            ],
        };
        expect(options).toBeTruthy();
    });
    test('puppeteer - hooks receive the user data typed via the options generic', () => {
        const options = {
            preNavigationHooks: [
                async ({ request }) => {
                    expectTypeOf(request.userData).toEqualTypeOf();
                },
            ],
        };
        expect(options).toBeTruthy();
    });
    test('stagehand - hooks receive the user data typed via the options generic', () => {
        const options = {
            preNavigationHooks: [
                async ({ request }) => {
                    expectTypeOf(request.userData).toEqualTypeOf();
                },
            ],
        };
        expect(options).toBeTruthy();
    });
});
export {};
