import { CrawlerExtension } from '@crawlee/core';

describe('CrawlerExtension', () => {
    test('should work', () => {
        class MyExtension extends CrawlerExtension { }
        const myExtension = new MyExtension();
        expect(myExtension.name).toEqual('MyExtension');
        expect(() => myExtension.getCrawlerOptions()).toThrow(`${myExtension.name} has not implemented "getCrawlerOptions" method.`);
        expect(myExtension.log.info).toBeDefined();
        // @ts-expect-error Accessing private prop
        expect(myExtension.log.options.prefix).toEqual('MyExtension');
    });
});
