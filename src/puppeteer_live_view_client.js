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
const createPage = (id, url) => `
  <tr id="${id}">
    <td class="status"></td>
    <td class="url"><a class="url" href="${url}" target="m_blank">${url}</a></td>
    <td class="more"><button>See more</button></td>
  </tr>
`;

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
    return `
      <table class="page-collection">${pageDivs.join('\n')}
        <thead>
          <th class="status">Status</th>
          <th class="url">URL</th>
          <th class="more">More</th>
        </thead>
      </table>
  `;
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
const createBrowser = (id, pages) => `<div class="browser" id="${id}"><h3>Browser: ${id}</h3>${createPageCollection(pages)}</div>`;

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
  <h2>Page detail</h2>
  <table class="page-detail">
    <tbody>
      <tr>
        <td>URL:</td>
        <td>${url}</td>
      </tr>
    </tbody>
  </table>

  <div id="tabmenu" class="tab-menu">
    <ul>
      <li><a class="tab-link" href="#" data-target="screenshot">Screenshot</a></li>
      <li><a class="tab-link" href="#" data-target="code">HTML Code</a></li>
    </ul>
  </div>

  <div id="screenshot" class="tabcontent">
    <img src="data:image/png;base64, ${image.toString('base64')}" alt="Page screenshot" />
  </div>

  <div id="code" class="tabcontent">
    <pre>
      <code class="original-html">
        ${escapedHtml}
      </code>
    </pre>
  </div>
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
            index.insertAdjacentHTML('afterbegin', '<h2>Browser dashboard</h2>');
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

            var tabMenuItems = document.querySelectorAll('.tab-menu .tab-link');
            console.log(tabMenuItems)

            for (i = 0; i < tabMenuItems.length; ++i) {
              tabMenuItems[i].onclick = (event) => {
                event.preventDefault();

                event = event || window.event;
                var target = event.target || event.srcElement,
                    text = target.textContent || text.innerText;

                const contentId = target.getAttribute('data-target');

                // Get all elements with class="tabcontent" and hide them
                var tabcontent = document.getElementsByClassName("tabcontent");
                for (var i = 0; i < tabcontent.length; i++) {
                    tabcontent[i].style.display = "none";
                }

                document.getElementById(contentId).style.display = "block";
              }
            };
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

            const button = page.querySelector('td.more button');
            button.onclick = () => sendCommand('renderPage', {
                id: page.getAttribute('id'),
            });

            var status = page.querySelector('td.status');
            if(status) status.innerText = 'Starting'
        },
        // Updates page URL on navigation
        updatePage: ({ id, url }) => {
            const page = document.getElementById(id);

            var spanUrl = page.querySelector('td.url');
            if(spanUrl) spanUrl.innerText = `${url}`;

            var status = page.querySelector('td.status');
            if(status) status.innerText = 'Running';
        },
        // Removes a page from a browser after fade-out
        destroyPage: ({ id }) => {
            const page = document.getElementById(id);

            var status = page.querySelector('td.status');
            if(status) status.innerText = 'Finished';

            var button = page.querySelector('td.more button');
            button.remove();

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
        index.insertAdjacentHTML('beforeend', '<div>Actor finished</div>');
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
    body {
      margin: 0;
      padding: 0;
      font-family: 'Graphik';
    }
    header {
      width: 100%;
      padding: 5px 10px;
      background: #1a346d;
      color: white;
    }
    h1 {
      margin: 10px 0;
      font-size: 28px;
      font-weight: 400;
    }
    h2 {
      font-size: 22px;
      font-weight: 500;
    }
    h3 {
      font-size: 15px;
      font-weight: 500;
    }
    main {
      padding: 5px 10px;
    }
    table {
      border-collapse: collapse;
    }
    table, th, td {
      border: 1px solid #DDD;
    }
    thead {
      background: #F8F9F9;
    }
    th,td {
      padding: 8px;
    }
    th {
      font-size: 16px;
      font-weight: 500;
      color: #9FA5A9;
    }
    th.status {
      min-width: 100px;
    }
    th.url {
      min-width: 400px;
    }
    th.more {
      min-width: 80px;
    }
    tbody {

    }
    tr {

    }
    td {

    }
    td.status {
      color: #69C242;
      min-width: 100px;
    }
    td.url {
      color: #00a6d0;
      min-width: 400px;
    }
    td.more {
      min-width: 80px;
    }
    table.page-detail td {
      border: none;
    }
    .tab-menu {
      margin: 30px 0 10px;
    }
    .tab-menu ul {
      list-style-type: none;height: 29px;
      border-bottom: 1px solid #ccc;
    }
    .tab-menu li {
      float: left;
      border: 1px solid #ccc;
      margin-right: 5px;
    }
    .tabmenu li.active {
      border-bottom-color: #ccc;
    }
    .tab-link {
      padding: 5px;
      display: block;
    }
    .tabcontent {
      display: none;
    }
  </style>
</head>
<body>
  <header>
    <h1>Puppeteer Live View</h1>
  </header>
  <main>
    <button id="back-button" class="hidden">Back to Index</button>
    <div id="index">Waiting for WebSocket connection.</div>
    <div id="page-detail" class="hidden"></div>
  </main>
  <script>
    const ws = new WebSocket("${url.replace('https', 'wss').replace('http', 'ws')}");
    const DESTROY_FADEOUT_MILLIS = ${DESTROY_FADEOUT_MILLIS};
    const createPage = ${createPage.toString()};
    const createPageCollection = ${createPageCollection.toString()};
    const createBrowser = ${createBrowser.toString()};
    (${wsHandler.toString()})(ws);
  </script>
</body>
</html>
`;
};
