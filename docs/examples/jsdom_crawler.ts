import { JSDOMCrawler } from '@crawlee/jsdom';

const crawler = new JSDOMCrawler({
    runScripts: true,
    requestHandler: async ({ window }) => {
        const { document } = window;
        document.querySelectorAll('button')[12].click(); // 1
        document.querySelectorAll('button')[15].click(); // +
        document.querySelectorAll('button')[12].click(); // 1
        document.querySelectorAll('button')[18].click(); // =

        const result = document.querySelectorAll('.component-display')[0].childNodes[0] as Element;

        console.log(result.innerHTML); // 2
    },
});

await crawler.run([
    'https://ahfarmer.github.io/calculator/',
]);
