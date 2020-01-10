import * as Apify from "./src/index";
import { CheerioHandlePage, CheerioHandlePageInputs } from "./src/typedefs";
import cheerio from "cheerio";

function x(ins: CheerioHandlePageInputs) {
    console.log(ins.$('a').attr('href'));
}

// See https://mariusschulz.com/blog/typing-destructured-object-parameters-in-typescript
function y({$}: { $: CheerioStatic }) {
    console.log($('a').attr('href'));
}

function z({$}): CheerioHandlePage {
    console.log($('a').attr('href'));
    return;
}

const body = '<a href="#">';
const ins: CheerioHandlePageInputs = {
    $: cheerio.load(body),
    body: body,
    request: new Apify.Request({url: '#'}),
    contentType: 'text/html',
    response: null,
    autoscaledPool: null
}

x(ins);
y(ins);
z(ins);
