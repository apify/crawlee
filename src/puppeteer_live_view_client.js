import { checkParamOrThrow } from 'apify-client/build/utils';

const DESTROY_PAGE_FADEOUT = 2000;

const createPage = (id, url) => `<div class="page" id="${id}">URL: ${url}</div>`;

const createPageCollection = (pages) => {
    const pageDivs = [];
    pages.forEach((page, id) => {
        pageDivs.push(createPage(id, page.url()));
    });
    return `<div class="page-collection">${pageDivs.join('\n')}</div>`;
};

const createBrowser = (id, pages) => `<div class="browser" id="${id}"><h3>${id}</h3>${createPageCollection(pages)}</div>`;

/**
 * Generates a body for the Index page. A list of browsers and their pages.
 * @param {Set} browsers
 * @returns {string} index page HTML
 */
export const indexPage = (browsers) => {
    const browserDivs = [];
    browsers.forEach(({ id, pages }) => browserDivs.push(createBrowser(id, pages)));
    return browserDivs.join('\n');
};

/**
 * Returns a body of a page consisting of a serialized image.
 * @param {Buffer} imageBuffer
 * @returns {string}
 */
export const detailPage = ({ id, url, image }) => {
    return `
<div id="${id}">
  <h3>Detail of Page: ${url}</h3>
  <div class="screenshot">
    <img src="data:image/png;base64, ${image.toString('base64')}" alt="Page screenshot" />
  </div> 
</div>

`;
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

const wsHandler = (socket) => {
    const index = document.getElementById('index');
    const pageDetail = document.getElementById('page-detail');
    const backButton = document.getElementById('back-button');
    backButton.onclick = () => {
        pageDetail.classList.add('hidden');
        backButton.classList.add('hidden');
        index.classList.remove('hidden');
    };

    const sendCommand = (command, data) => {
        if (socket.readyState === 1) {
            const payload = JSON.stringify({ command, data });
            socket.send(payload);
        }
    };

    const COMMANDS = {
        renderIndex: ({ html }) => {
            index.innerHTML = html;
            index.querySelectorAll('.page').forEach((page) => {
                page.onclick = () => sendCommand('renderPage', {
                    id: page.getAttribute('id'),
                });
            });
        },
        renderPage: ({ html }) => {
            index.classList.add('hidden');
            backButton.classList.remove('hidden');
            pageDetail.classList.remove('hidden');
            pageDetail.innerHTML = html;
        },
        createPage: ({ id, browserId, url }) => {
            const pages = document.getElementById(browserId).querySelector('.page-collection');
            pages.insertAdjacentHTML('afterbegin', createPage(id, url));
            const page = document.getElementById(id);
            page.onclick = () => sendCommand('renderPage', {
                id: page.getAttribute('id'),
            });
        },
        updatePage: ({ id, url }) => {
            const page = document.getElementById(id);
            page.innerText = `URL: ${url}`;
        },
        destroyPage: ({ id }) => {
            const page = document.getElementById(id);
            page.classList.add('destroyed');
            // do not remove immediately since it can happen pretty fast
            // and the page only pops in the list for a split second
            setTimeout(() => page.remove(), DESTROY_PAGE_FADEOUT);
        },
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
};

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
      transition: visibility 0s 2s, opacity 2s linear;
    }
    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <h1>Puppeteer Live View</h1>
  <button id="back-button" class="hidden">Back to Index</button>
  <div id="index">Waiting for WebSocket connection.</div>
  <div id="page-detail" class="hidden"></div>
  <script>
    const ws = new WebSocket("ws://${opts.host}:${opts.port}");
    const DESTROY_PAGE_FADEOUT = ${DESTROY_PAGE_FADEOUT};
    const createPage = ${createPage.toString()};
    const createPageCollection = ${createPageCollection.toString()};
    const createBrowser = ${createBrowser.toString()};
    (${wsHandler.toString()})(ws);
  </script>
</body>
</html>
`;
};
