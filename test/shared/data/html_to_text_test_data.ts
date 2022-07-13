/* eslint-disable */

// The whitespace in the text is important. Don't change it.
// We're keeping this text as a JS string, because git and other
// tools do magic with line endings and it can break tests.
// E.g. LF -> CRLF on Win or auto-trimming of lines in editors.
export const text = 'Let\'s start with a simple text. \n' +
    'The ships hung in the sky, much the way that bricks don\'t. \n' +
    'These aren\'t the Droids you\'re looking for\n' +
    'I\'m sorry, Dave. I\'m afraid I can\'t do that.\n' +
    'I\'m sorry, Dave. I\'m afraid I can\'t do that.\n' +
    'A1\tA2\tA3\t\n' +
    'B1\tB2\tB3\tB 4\t\n' +
    'This is some text with inline elements and HTML entities (>bla<) \n' +
    'Test\n' +
    'a\n' +
    'few\n' +
    'line\n' +
    'breaks\n' +
    'Spaces in an inline text should be completely ignored. \n' +
    'But,\n' +
    '    a pre-formatted\n' +
    '                block  should  be  kept\n' +
    '                                       pre-formatted.\n' +
    'The Greatest Science Fiction Quotes Of All Time \n' +
    'Don\'t know, I don\'t know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design, just eyes. You Nexus, huh? I design your eyes.'

export const html = `<html>
<head>
    <title>Title SHOULD NOT be converted</title>

    <!-- Comments SHOULD NOT be converted -->
</head>
<body with='some attributes'>
Let's start with a        simple text.
<p>
    The ships hung in the sky, much the <a class="click" href="https://example.com/a/b/first">way that</a> bricks don't.
</p>
<ul>
    <li>These aren't the Droids you're looking for</li>
    <li some="attribute"><a href="https://example.com/a/second">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
    <li><a class="click" href="https://example.com/a/b/third">I'm sorry, Dave. I'm afraid I can't do that.</a></li>
</ul>

<img src="something" alt="This should be ignored" />

<!-- Comments SHOULD NOT be converted -->

<table>
    <tr class="something">
        <td>A1</td>
        <td attributes="are ignored">A2</td>
        <td>A3</td>
    </tr>
    <tr class="something">
        <td>B1</td>
        <td attributes="are ignored" even="second attribute">B2</td>
        <td>B3</td>
        <td>B     4</td>
    </tr>
</table>

<p>
    This is <b>some<i> text <b>with</b></i></b> inline <span>elements</span> and HTML&nbsp;entities (&gt;bla&lt;)
</p>

<div>
    Test<br>
    a<br />
    few<br>
    line<br>
    breaks<br>
</div>




    Spaces


    in


    an inline text                                should be


    completely ignored.



<pre>
But,
    a pre-formatted
                block  should  be  kept
                                       pre-formatted.
</pre>

<svg>
    These special elements SHOULD NOT BE CONVERTED.
</svg>

<script>
    // These special elements should be completely skipped.
    skipThis();
</script>

<style>
    /* These special elements should be completely skipped. */
    .skip_this {}
</style>

<canvas>
    This should be skipped too.
</canvas>

<a class="click" href="https://another.com/a/fifth">The Greatest Science Fiction Quotes Of All Time</a>
<p>
    Don't know, I don't know such stuff. I just do eyes, ju-, ju-, just eyes... just genetic design,
    just eyes. You Nexus, huh? I design your <a class="click" href="http://cool.com/">eyes</a>.
</p>
</body>
</html>`
