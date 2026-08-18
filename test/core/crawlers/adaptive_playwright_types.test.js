describe('AdaptivePlaywrightCrawler option types (#2063)', () => {
    test('request handler typed with custom user data stays assignable', () => {
        const requestHandler = async ({ request }) => void request.userData.label;
        const options = { requestHandler };
        expect(options).toBeTruthy();
    });
});
export {};
