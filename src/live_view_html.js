import { checkParamOrThrow } from 'apify-client/build/utils';

/**
 * Template for a basic layout of a HTML page.
 * @param {String} opts.host hostname of the WebSocket server
 * @param {Number} opts.port port of the WebSocket server
 * @returns {string} html
 */
export const layout = (opts = {}) => {
    checkParamOrThrow(opts.host, 'opts.host', 'String');
    checkParamOrThrow(opts.port, 'opts.port', 'Number');

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Live View Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  ${opts.refresh ? `<meta http-equiv="refresh" content="${opts.refresh}">` : ''}
</head>
<body>
  <div id="ws-container">Waiting for WebSocket connection.</div>
  <script>
    var container = document.getElementById("ws-container");
    var ws = new WebSocket("ws://${opts.host}:${opts.port}");
    ws.onmessage = (e) => {
      container.innerHTML = e.data;
    }
  </script>
</body>
</html>
`;
};

/**
 * Generates a body for the rootPage. A list of browsers and their IDs.
 * @param {Array} browsers
 * @returns {string}
 */
export const rootPage = (browsers) => {
    const body = `
<h1>Available live view browsers:</h1>
    ${browsers.map(b => `
    <a href="/browser/${b.id}"><p>ID: ${b.id}</p></a>
    `).join('')}
`;
    return layout({
        body,
        refresh: 3,
    });
};

/**
 * Returns an image encoded as a base64 string in an <img> tag.
 * @param {Buffer} imageBuffer
 * @returns {string}
 */
export const encodeImg = (imageBuffer) => {
    return `
<div>
    <img src="data:image/png;base64, ${imageBuffer.toString('base64')}" alt="Page screenshot" />
</div> 
`;
};

/**
 * Returns a body of a page consisting of a serialized image.
 * @param {Buffer} imageBuffer
 * @returns {string}
 */
export const imgPage = (imageBuffer) => {
    const body = encodeImg(imageBuffer);
    return layout({
        body,
        refresh: 1,
    });
};

/**
 * Returns a 404 response page.
 * @returns {string}
 */
export const notFoundPage = () => {
    const body = '<p>This page does not exist.</p>';
    return layout({ body });
};

/**
 * Returns an error page with an error message.
 * @param {String} message
 * @returns {string}
 */
export const errorPage = (message) => {
    const body = `
<p>Sorry. There was an error and Live View failed.</p>
${message ? `<p>Message: ${message}</p>` : ''}
`;
    return layout({ body });
};
