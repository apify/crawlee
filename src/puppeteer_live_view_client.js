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
    <td class="more"><i class="material-icons">search</i></td>
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
          <th class="more"></th>
        </thead>
        <tbody></tbody>
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
        <td><a href="${url}" target="m_blank">${url}</a></td>
      </tr>
    </tbody>
  </table>

  <div id="tabmenu" class="tab-menu">
    <ul>
      <li><a class="tab-link active" href="#" data-target="screenshot">Screenshot</a></li>
      <li><a class="tab-link" href="#" data-target="code">HTML Code</a></li>
    </ul>
  </div>

  <div id="screenshot" class="tab-content">
    <img src="data:image/png;base64, ${image.toString('base64')}" alt="Page screenshot" />
  </div>

  <div id="code" class="tab-content hidden">
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
    const backLink = document.getElementById('back-link');

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
            backLink.classList.remove('hidden');
            pageDetail.classList.remove('hidden');
            pageDetail.innerHTML = html;

            var tabMenuItems = document.querySelectorAll('.tab-menu .tab-link');

            for (i = 0; i < tabMenuItems.length; ++i) {
              tabMenuItems[i].onclick = (event) => {
                event.preventDefault();

                event = event || window.event;
                var target = event.target || event.srcElement,
                    text = target.textContent || text.innerText;

                const contentId = target.getAttribute('data-target');

                // Get all tab content blocks and hide them
                var tabContents = document.getElementsByClassName("tab-content");
                for (var i = 0; i < tabContents.length; i++) {
                    tabContents[i].classList.add('hidden');
                }

                // Get all tab menu links and remove active class
                var tabLinks = document.getElementsByClassName("tab-link");
                for (var i = 0; i < tabLinks.length; i++) {
                    tabLinks[i].classList.remove("active")
                }

                // Marked the clicked tab menu item as active
                target.classList.add("active");

                // Show the correct content block;
                document.getElementById(contentId).classList.remove('hidden');
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
            const pages = document.getElementById(browserId).querySelector('.page-collection tbody');
            pages.insertAdjacentHTML('afterbegin', createPage(id, url));
            const page = document.getElementById(id);

            const button = page.querySelector('td.more i');
            button.onclick = () => sendCommand('renderPage', {
                id: page.getAttribute('id'),
            });

            var status = page.querySelector('td.status');
            if(status) status.innerHTML = '<i class="material-icons orange">watch_later</i><span class="orange">Starting</span>';
        },
        // Updates page URL on navigation
        updatePage: ({ id, url }) => {
            const page = document.getElementById(id);

            var spanUrl = page.querySelector('td.url');
            if(spanUrl) spanUrl.innerHTML = `<a class="url" href="${url}" target="m_blank">${url}</a>`;

            const status = page.querySelector('td.status');
            if(status) status.innerHTML = '<i class="material-icons rotating">cached</i><span>Running</span>';
        },
        // Removes a page from a browser after fade-out
        destroyPage: ({ id }) => {
            const page = document.getElementById(id);

            const status = page.querySelector('td.status');
            if(status) status.innerHTML = '<i class="material-icons">check_circle</i><span>Finished</span>';

            var button = page.querySelector('td.more i');
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
        index.insertAdjacentHTML('beforeend', '<div class="message">Actor finished</div>');
    };

    socket.onerror = (err) => {
        console.error(err); //eslint-disable-line
    };

    // The Index Page and Page Detail are not rerendered every time since
    // it complicates WebSocket communication (adding / removing listeners).
    // Instead, clicking on a page in the Index simply hides the Index
    // and shows Page Detail and the Back link.
    // Clicking the back link hides the detail and shows the Index Page.
    backLink.onclick = () => {
        pageDetail.classList.add('hidden');
        backLink.classList.add('hidden');
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
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
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
      word-wrap: break-word;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Graphik, sans-serif;
    }
    header {
      width: 100%;
      padding: 5px 15px;
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
      margin-bottom: 25px;
    }
    h3 {
      font-size: 15px;
      font-weight: 500;
    }
    main {
      padding: 5px 15px;
    }
    a {
      color: #00A6D0;
      text-decoration: none;
      transition: all .2s ease-in-out;
    }
    a:focus, a:hover {
      color: #006984;
      text-decoration: underline;
    }
    #back-link {
      margin: 10px 0;
      cursor: pointer;
      width: fit-content;
    }
    #back-link i {
      background: #1a346d;
      color: white;
      border-radius: 100%;
      border: 1px solid #1a346d;
      font-size: 14px;
      padding: 3px;
      float: left;
      margin-top: -2px;
      margin-right: 5px;
      transition: all .3s ease-in;
    }
    #back-link:hover i {
      background: white;
      border-color: #1a346d;
      color: #1a346d;
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
      font-size: 14px;
      vertical-align: middle;
      height: 24px;
    }
    th {
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
      min-width: 42px;
    }
    td.status {
      color: #69C242;
      min-width: 100px;
    }
    td.status i {
      float: left;
    }
    td.status span {
      margin-left: 10px;
      line-height: 24px;
    }
    td.url {
      min-width: 400px;
    }
    td.more {
      color: #00a6d0;
      text-align: center;
      position: relative;
    }
    td.more:focus, td.more:hover {
      color: #006984;
      text-decoration: underline;
    }
    td.more i {
      cursor: pointer;
      position: absolute;
      left: 18px;
      top: 7px;
    }
    table.page-detail {
      border: none;
    }
    table.page-detail td {
      border: none;
      padding-left: 0;
      padding-right: 20px;
      font-size: 14px;
    }
    table.page-detail td:first-child {
      font-weight: 700
    }
    .tab-menu {
      margin: 30px 0 0;
    }
    .tab-menu ul {
      list-style-type: none;
      border-bottom: 1px solid #ddd;
      margin-bottom: 0;
      padding-left: 0;
      text-transform: uppercase;
    }
    .tab-menu ul:after, .tab-menu ul:before {
      content: " ";
      display: table;
    }
    .tab-menu ul:after {
      clear: both;
    }
    .tab-menu li {
      float: left;
      margin-right: 10px;
      display: block;
      margin-bottom: -1px;
    }
    .tab-link {
      padding: 10px 15px;
      display: block;
      color: #9fa5a9;
      text-decoration: none;
      border: 1px solid #ddd;
      transition: background .3s ease-in;
      border-radius: 3px 3px 0 0;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.428571429;
    }
    .tab-link:focus, .tab-link:hover {
      color: #9fa5a9;
      border-color: #ddd;
      text-decoration: none;
      background-color: #eee;
    }
    .tab-link.active {
      border-bottom-color: #fff;
      color: #11181c;
      background: #fff;
    }
    .tab-content {
      padding: 20px;
      border-top: 0;
      border: 1px solid #ddd;
      border-top: none;
      visibility: visible;
      opacity: 1;
      transition: opacity 0.3s ease-in;
    }
    .tab-content.hidden {
      display: block;
      visibility: hidden;
      opacity: 0;
      height: 0;
      border: none;
      padding: 0;
    }
    .tab-content.hidden pre {
      display: none;
    }
    .tab-content img{
      max-width: 100%;
    }
    .message {
      color: #69C242;
    }
    .orange {
      color: #f0ad4e;
    }
    @-webkit-keyframes rotating {
    from { -webkit-transform: rotate(0deg); }
    to { -webkit-transform: rotate(-360deg); }
    }
    @-moz-keyframes rotating {
        from { -moz-transform: rotate(0deg); }
        to { -moz-transform: rotate(-360deg); }
    }
    @keyframes rotating {
        from {transform:rotate(0deg);}
        to {transform:rotate(-360deg);}
    }

    .rotating {
        -webkit-animation: rotating 2s linear infinite;
           -moz-animation: rotating 2s linear infinite;
                animation: rotating 2s linear infinite;
    }
  </style>
</head>
<body>
  <header>
    <h1>Puppeteer Live View</h1>
  </header>
  <main>
    <div id="back-link" class="hidden">
        <i class="material-icons">arrow_back</i>
        <span>dashboard</span>
    </div>
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
