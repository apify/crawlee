import type { CheerioRoot } from '@crawlee/utils';
import { htmlToText } from '@crawlee/utils';
import cheerio from 'cheerio';

import * as htmlToTextData from '../shared/data/html_to_text_test_data';

const checkHtmlToText = (html: string | CheerioRoot, expectedText: string, hasBody = false) => {
    const text1 = htmlToText(html);
    expect(text1).toEqual(expectedText);

    // Test embedding into <body> gives the same result
    if (typeof html === 'string' && !hasBody) {
        const html2 = `
        <html>
            <head>
                <title>Title should be ignored</title>
                <style>
                    .styles_should_be_ignored_too {}
                </style>
                <script type="application/javascript">
                    scriptsShouldBeIgnoredToo();
                </script>
            </head>
            <body>
                ${html}
            </body>
        </html>`;
        const text2 = htmlToText(html2);
        expect(text2).toEqual(expectedText);
    }
};

describe('htmlToText()', () => {
    test('handles invalid args', () => {
        checkHtmlToText(null, '');
        checkHtmlToText('', '');
        // @ts-expect-error
        checkHtmlToText(0, '');
        checkHtmlToText(undefined, '');
    });

    test('handles basic HTML elements correctly', () => {
        checkHtmlToText('Plain text node', 'Plain text node');
        checkHtmlToText('   Plain    text     node    ', 'Plain text node');
        checkHtmlToText('   \nPlain    text     node  \n  ', 'Plain text node');

        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2>', 'Header 1\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2><br>', 'Header 1\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2><br><br>', 'Header 1\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <h2>Header 2</h2><br><br><br>', 'Header 1\nHeader 2');

        checkHtmlToText('<h1>Header 1</h1><br><h2>Header 2</h2><br><br><br>', 'Header 1\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1> <br> <h2>Header 2</h2><br><br><br>', 'Header 1\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1>  \n <br>\n<h2>Header 2</h2><br><br><br>', 'Header 1\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1>  \n <br>\n<br><h2>Header 2</h2><br><br><br>', 'Header 1\n\n\nHeader 2');
        checkHtmlToText('<h1>Header 1</h1>  \n <br>\n<br><br><h2>Header 2</h2><br><br><br>', 'Header 1\n\n\n\nHeader 2');

        checkHtmlToText('<div><div>Div</div><p>Paragraph</p></div>', 'Div\nParagraph');
        checkHtmlToText('<div>Div1</div><!-- Some comments --><div>Div2</div>', 'Div1\nDiv2');

        checkHtmlToText('<div>Div1</div><style>Skip styles</style>', 'Div1');
        checkHtmlToText('<script>Skip_scripts();</script><div>Div1</div>', 'Div1');
        checkHtmlToText('<SCRIPT>Skip_scripts();</SCRIPT><div>Div1</div>', 'Div1');
        checkHtmlToText('<svg>Skip svg</svg><div>Div1</div>', 'Div1');
        checkHtmlToText('<canvas>Skip canvas</canvas><div>Div1</div>', 'Div1');

        checkHtmlToText('<b>A  B  C  D  E\n\nF  G</b>', 'A B C D E F G');
        checkHtmlToText('<pre>A  B  C  D  E\n\nF  G</pre>', 'A  B  C  D  E\n\nF  G');

        checkHtmlToText(
            '<h1>Heading 1</h1><div><div><div><div>Deep  Div</div></div></div></div><h2>Heading       2</h2>',
            'Heading 1\nDeep Div\nHeading 2',
        );

        checkHtmlToText('<a>this_word</a>_should_<b></b>be_<span>one</span>', 'this_word_should_be_one');
        checkHtmlToText('<span attributes="should" be="ignored">some <span>text</span></span>', 'some text');

        checkHtmlToText(
            `<table>
                <tr>
                    <td>Cell    A1</td><td>Cell A2</td>
                    <td>    Cell A3    </td>
                </tr>
                <tr>
                    <td>Cell    B1</td><td>Cell B2</td>
                </tr>
            </table>`,
            'Cell A1\tCell A2\tCell A3 \t\nCell B1\tCell B2',
        );
    });

    test('handles HTML entities correctly', () => {
        checkHtmlToText('<span>&aacute; &eacute;</span>', 'á é');
    });

    test('handles larger HTML documents', () => {
        const { html, text } = htmlToTextData;
        // Careful here - don't change any whitespace in the text below or the test will break, even trailing!
        checkHtmlToText(html, text, true);
    });

    test('works with Cheerio object', () => {
        const html1 = '<html><body>Some text</body></html>';
        checkHtmlToText(cheerio.load(html1, { decodeEntities: true }), 'Some text');

        const html2 = '<h1>Text outside of body</h1>';
        checkHtmlToText(cheerio.load(html2, { decodeEntities: true }), 'Text outside of body');
    });
});
