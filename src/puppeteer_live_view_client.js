import { checkParamOrThrow } from 'apify-client/build/utils';

// Everything gets destroyed slowly to make the UX better
const DESTROY_FADEOUT_MILLIS = 2000;

/**
 * Creates a page line in the Index.
 *
 * Used both client and server-side.
 *
 * @param {string} id
 * @param {string} url
 * @returns {string} html
 */
const createPage = (id, url) => `<div class="page" id="${id}">URL: ${url}</div>`;

/**
 * Turns a Map of Pages into an Array of page divs.
 *  = All Pages of a single PuppeteerLiveViewBrowser.
 *
 * Used both client and server-side.
 *
 * @param {Map<String,Page>} pages
 * @returns {string} html
 */
const createPageCollection = (pages) => {
    const pageDivs = [];
    pages.forEach((page, id) => {
        pageDivs.push(createPage(id, page.url()));
    });
    return `<div class="page-collection">${pageDivs.join('\n')}</div>`;
};

/**
 * Creates a browser line in the Index.
 *
 * Used both client and server-side.
 *
 * @param {string} id Browser ID.
 * @param {Map<String,Page>} pages
 * @returns {string} html
 */
const createBrowser = (id, pages) => `<div class="browser" id="${id}"><h3>${id}</h3>${createPageCollection(pages)}</div>`;

/**
 * Turns a Set of Browsers into an Array of browser divs.
 *  = All PuppeteerLiveViewBrowsers of a PuppeteerLiveViewServer.
 *
 * Used both client and server-side.
 *
 * @param {Set} browsers
 * @returns {string} html
 */
const createBrowserCollection = (browsers) => {
    const browserDivs = [];
    browsers.forEach(({ id, pages }) => {
        browserDivs.push(createBrowser(id, pages));
    });
    return `<div class="browser-collection">${browserDivs.join('\n')}</div>`;
};

/**
 * Generates an HTML body for the Index page.
 * A list of PuppeteerLiveViewBrowsers and their Pages.
 *
 * Used only server-side.
 *
 * @param {Set} browsers
 * @returns {string} html
 */
export const indexPage = (browsers) => {
    return createBrowserCollection(browsers);
};

/**
 * Returns a body of a Page consisting of a serialized
 * image and a HTML representation.
 *
 * Used only server-side.
 *
 * @param {Buffer} imageBuffer
 * @returns {string} html
 */
export const detailPage = ({ id, url, image, html }) => {
    const chars = { '<': '&lt', '>': '&gt', '&': '&amp' };
    const escapedHtml = html.replace(/[<>&]/g, m => chars[m]);

    return `
<div id="${id}">
  <h3>Detail of Page: ${url}</h3>
  <div class="screenshot">
    <img src="data:image/png;base64, ${image.toString('base64')}" alt="Page screenshot" />
  </div>
    <pre>
      <code class="original-html">
        ${escapedHtml}
      </code>
    </pre>
</div>

`;
};

export const errorPage = ({ id, url, error }) => {
    return `
<div id="${id}">
  <h3>There has been an error on page: ${url}</h3>
  <div class="error">
    <h4>${error.message}</h4>
  </div>
</div>

`;
};

/**
 * The wsHandler() function encapsulates the whole client-side
 * messaging and rendering logic. All commands that the client
 * is able to receive and understand are listed in COMMANDS.
 *
 * @param {WebSocket} socket
 */
const wsHandler = (socket) => {
    // Get common elements
    const index = document.getElementById('index');
    const pageDetail = document.getElementById('page-detail');
    const backButton = document.getElementById('back-button');

    // A client implementation of the server's sendCommand()
    const sendCommand = (command, data) => {
        // Send only if socket is open
        if (socket.readyState === 1) {
            const payload = JSON.stringify({ command, data });
            socket.send(payload);
        }
    };

    const COMMANDS = {
        // Renders the Index Page - a list of browsers and their pages
        renderIndex: ({ html }) => {
            index.innerHTML = html;
            index.querySelectorAll('.page').forEach((page) => {
                page.onclick = () => sendCommand('renderPage', {
                    id: page.getAttribute('id'),
                });
            });
        },
        // Renders the Page Detail - where screenshots and HTML are shown
        renderPage: ({ html }) => {
            index.classList.add('hidden');
            backButton.classList.remove('hidden');
            pageDetail.classList.remove('hidden');
            pageDetail.innerHTML = html;
        },
        // Adds a browser to the list
        createBrowser: ({ id }) => {
            const browsers = index.querySelector('.browser-collection');
            browsers.insertAdjacentHTML('afterbegin', createBrowser(id));
        },
        // Removes a browser from the list after fade-out
        destroyBrowser: ({ id }) => {
            const browser = document.getElementById(id);
            browser.classList.add('destroyed');
            // Do not remove immediately
            setTimeout(() => browser.remove(), DESTROY_FADEOUT_MILLIS);
        },
        // Adds a page to it's parent browser
        createPage: ({ id, browserId, url }) => {
            const pages = document.getElementById(browserId).querySelector('.page-collection');
            pages.insertAdjacentHTML('afterbegin', createPage(id, url));
            const page = document.getElementById(id);
            page.onclick = () => sendCommand('renderPage', {
                id: page.getAttribute('id'),
            });
        },
        // Updates page URL on navigation
        updatePage: ({ id, url }) => {
            const page = document.getElementById(id);
            page.innerText = `URL: ${url}`;
        },
        // Removes a page from a browser after fade-out
        destroyPage: ({ id }) => {
            const page = document.getElementById(id);
            page.classList.add('destroyed');
            // Do not remove immediately since it can happen pretty fast
            // and the page only pops in the list for a split second.
            setTimeout(() => page.remove(), DESTROY_FADEOUT_MILLIS);
        },
        // Handles errors
        error: ({ message, status }) => {
            console.error(`${status}: ${message}`); // eslint-disable-line
        },
    };

    socket.onmessage = (e) => {
        let message;
        try {
            message = JSON.parse(e.data);
        } catch (err) {
            return console.error('Unable to parse message from server:', e.data); // eslint-disable-line
        }

        // Validate and invoke requested command
        const { command, data } = message;
        if (!command) return console.error('Invalid command:', command); // eslint-disable-line
        const fn = COMMANDS[command];
        if (!fn || typeof fn !== 'function') return console.error('Command not recognized by client:', command); // eslint-disable-line
        fn(data);
    };

    socket.onclose = () => {
        index.insertAdjacentHTML('beforebegin', '<div>Act finished</div>');
    };

    socket.onerror = (err) => {
        console.error(err); //eslint-disable-line
    };

    // The Index Page and Page Detail are not rerendered every time since
    // it complicates WebSocket communication (adding / removing listeners).
    // Instead, clicking on a page in the Index simply hides the Index
    // and shows Page Detail and the Back Button.
    // Clicking the back button hides the detail and shows the Index Page.
    backButton.onclick = () => {
        pageDetail.classList.add('hidden');
        backButton.classList.add('hidden');
        index.classList.remove('hidden');
        const id = pageDetail.firstElementChild.getAttribute('id');
        sendCommand('quitPage', { id });
    };
};

/**
 * Template for a basic layout of a HTML page that enables WebSocket
 * communication. Constants and JavaScript are templated directly into
 * the HTML. This HTML page is the only piece of data sent over HTTP.
 * All other communication takes place over WebSockets.
 *
 * @param {String} url Url of the WebSocket server
 * @returns {string} html
 */
export const layout = (url) => {
    checkParamOrThrow(url, 'url', 'String');

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Puppeteer Live View Server</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <style>
    .page:hover {
      cursor: pointer;
      background: lightgreen;
    }
    .destroyed {
      color: #660000;
      visibility: hidden;
      opacity: 0;
      transition: visibility 0s ${DESTROY_FADEOUT_MILLIS / 1000}s, opacity ${DESTROY_FADEOUT_MILLIS / 1000}s linear;
    }
    .hidden {
      display: none;
    }
    .original-html {
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <h1>Puppeteer Live View</h1>
  <button id="back-button" class="hidden">Back to Index</button>
  <div id="index">Waiting for WebSocket connection.</div>
  <div id="page-detail" class="hidden"></div>
  <script>
    const ws = new WebSocket("${url.replace('https', 'wss')}");
    const DESTROY_FADEOUT = ${DESTROY_FADEOUT_MILLIS};
    const createPage = ${createPage.toString()};
    const createPageCollection = ${createPageCollection.toString()};
    const createBrowser = ${createBrowser.toString()};
    (${wsHandler.toString()})(ws);
  </script>
</body>
</html>
`;
};
