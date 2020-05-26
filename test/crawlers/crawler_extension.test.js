import CrawlerExtension from '../../build/crawlers/crawler_extension';

describe('CrawlerExtension', () => {
    test('should work', () => {
        class MyExtension extends CrawlerExtension {
            constructor(options) {
                super();
                this.options = options;
            }
        }
        const myExtension = new MyExtension();
        expect(myExtension.name).toEqual('MyExtension');
        expect(() => myExtension.getCrawlerOptions()).toThrow(`${myExtension.name} has not implemented "getCrawlerOptions" method.`);
        expect(myExtension.log.info).toBeDefined();
        expect(myExtension.log.options.prefix).toEqual('MyExtension');
    });
});
