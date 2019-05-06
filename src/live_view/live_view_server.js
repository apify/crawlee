import http from 'http';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import express from 'express';
import socketio from 'socket.io';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { promisifyServerListen } from 'apify-shared/utilities';
import { ENV_VARS, LOCAL_ENV_VARS } from 'apify-shared/consts';
import { addTimeoutToPromise } from '../utils';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const ensureDir = promisify(fs.ensureDir);

/**
 * `LiveViewServer` enables serving of browser snapshots via web sockets. It includes its own client
 * that provides a simple frontend to viewing the captured snapshots. A snapshot consists of three
 * pieces of information, the currently opened URL, the content of the page (HTML) and its screenshot.
 *
 * ```json
 * {
 *     "pageUrl": "https://www.example.com",
 *     "htmlContent": "<html><body> ....",
 *     "screenshotIndex": 3,
 *     "createdAt": "2019-04-18T11:50:40.060Z"
 * }
 * ```
 *
 * `LiveViewServer` is useful when you want to be able to inspect the current browser status on demand.
 * When no client is connected, the webserver consumes very low resources so it should have a close
 * to zero impact on performance. Only once a client connects the server will start serving snapshots.
 * Once no longer needed, it can be disabled again in the client to remove any performance impact.
 *
 * NOTE: Screenshot taking in browser typically takes around 300ms. So having the `LiveViewServer`
 * always serve snapshots will have a significant impact on performance.
 *
 * When using {@link PuppeteerPool}, the `LiveViewServer` can be
 * easily used just by providing the `useLiveView = true` option to the {@link PuppeteerPool}.
 * It can also be initiated via {@link PuppeteerCrawler} `puppeteerPoolOptions`.
 *
 * It will take snapshots of the first page of the latest browser. Taking snapshots of only a
 * single page improves performance and stability dramatically in high concurrency situations.
 *
 * When running locally, it is often best to use a headful browser for debugging, since it provides
 * a better view into the browser, including DevTools, but `LiveViewServer` works too.
 *
 * @param {Object} [options]
 *   All `LiveViewServer` parameters are passed
 *   via an options object with the following keys:
 * @param {string} [options.screenshotDirectoryPath]
 *   By default, the screenshots are saved to
 *   the `live_view` directory in the process' working directory. Provide a different
 *   absolute path to change the settings.
 * @param {number} [options.maxScreenshotFiles=10]
 *   Limits the number of screenshots stored
 *   by the server. This is to prevent using up too much disk space.
 * @param {number} [options.snapshotTimeoutSecs=3]
 *   If a snapshot is not made within the timeout,
 *   its creation will be aborted. This is to prevent
 *   pages from being hung up by a stalled screenshot.
 * @param {number} [options.maxSnapshotFrequencySecs=2]
 *   Use this parameter to further decrease the resource consumption
 *   of `LiveViewServer` by limiting the frequency at which it'll
 *   serve snapshots.
 */
class LiveViewServer {
    constructor(options = {}) {
        const {
            screenshotDirectoryPath = path.resolve('live_view'),
            maxScreenshotFiles = 10,
            snapshotTimeoutSecs = 3,
            maxSnapshotFrequencySecs = 2,
        } = options;

        checkParamOrThrow(screenshotDirectoryPath, 'options.screenshotDirectoryPath', 'String');
        checkParamOrThrow(maxScreenshotFiles, 'options.maxScreenshotFiles', 'Number');
        checkParamOrThrow(maxScreenshotFiles, 'options.snapshotTimeoutSecs', 'Number');
        checkParamOrThrow(maxScreenshotFiles, 'options.maxSnapshotFrequencySecs', 'Number');
        this.screenshotDirectoryPath = screenshotDirectoryPath;
        this.maxScreenshotFiles = maxScreenshotFiles;
        this.snapshotTimeoutMillis = snapshotTimeoutSecs * 1000;
        this.maxSnapshotFrequencyMillis = maxSnapshotFrequencySecs * 1000;

        // Snapshot data
        this.lastSnapshot = null;
        this.lastScreenshotIndex = 0;

        // Server
        this.clientCount = 0;
        this._isRunning = false;
        this.httpServer = null;
        this.socketio = null;
        this.servingSnapshot = false;

        this._setupHttpServer();
    }

    /**
     * Starts the HTTP server with web socket connections enabled.
     * Snapshots will not be created until a client has connected.
     * @return {Promise}
     */
    async start() {
        await ensureDir(this.screenshotDirectoryPath);
        await promisifyServerListen(this.httpServer)(this.port);
        log.info('Live view web server started', { publicUrl: this.liveViewUrl });
        this._isRunning = true;
    }

    /**
     * Prevents the server from receiving more connections. Existing connections
     * will not be terminated, but the server will not prevent a process exit.
     * @return {Promise}
     */
    async stop() {
        this.httpServer.unref();
        return new Promise((resolve) => {
            this.httpServer.close((err) => {
                this._isRunning = false;
                if (err) log.exception(err, 'Live view web server could not be stopped.');
                else log.info('Live view web server stopped.');
                resolve();
            });
        });
    }

    /**
     * Serves a snapshot to all connected clients.
     * Screenshots are not served directly, only their index number
     * which is used by client to retrieve the screenshot.
     *
     * Will time out and throw in `options.snapshotTimeoutSecs`.
     *
     * @param {Page} page
     * @return {Promise}
     */
    async serve(page) {
        if (!this.hasClients()) return;
        // Only serve one snapshot at a time because Puppeteer
        // can't make screenshots in parallel.
        if (this.servingSnapshot) return;

        if (this.lastSnapshot) {
            const lastSnapshotAgeMillis = Date.now() - this.lastSnapshot.createdAt;
            if (lastSnapshotAgeMillis < this.maxSnapshotFrequencyMillis) return;
        }

        try {
            this.servingSnapshot = true;
            const snapshot = await addTimeoutToPromise(
                this._makeSnapshot(page),
                this.snapshotTimeoutMillis,
                'LiveViewServer: Serving of Live View timed out.',
            );
            this._pushSnapshot(snapshot);
        } finally {
            this.servingSnapshot = false;
        }
    }

    /**
     * @return {?Object}
     */
    getLastSnapshot() {
        return this.lastSnapshot;
    }

    /**
     * @return {boolean}
     */
    isRunning() {
        return this._isRunning;
    }

    /**
     * @return {boolean}
     */
    hasClients() {
        // Treat LiveViewServer as a client, until at least one snapshot is made.
        return this.lastSnapshot ? this.clientCount > 0 : true;
    }

    /**
     * Returns an absolute path to the screenshot with the given index.
     * @param {number} screenshotIndex
     * @return {string}
     * @ignore
     */
    _getScreenshotPath(screenshotIndex) {
        return path.join(this.screenshotDirectoryPath, `${screenshotIndex}.jpeg`);
    }

    async _makeSnapshot(page) {
        const pageUrl = page.url();
        log.info('Making live view snapshot.', { pageUrl });
        const [htmlContent, screenshot] = await Promise.all([
            page.content(),
            page.screenshot({
                type: 'jpeg',
                quality: 75,
            }),
        ]);

        const screenshotIndex = this.lastScreenshotIndex++;

        await writeFile(this._getScreenshotPath(screenshotIndex), screenshot);
        if (screenshotIndex > this.maxScreenshotFiles - 1) {
            this._deleteScreenshot(screenshotIndex - this.maxScreenshotFiles);
        }

        const snapshot = { pageUrl, htmlContent, screenshotIndex, createdAt: new Date() };
        this.lastSnapshot = snapshot;
        return snapshot;
    }

    _pushSnapshot(snapshot) {
        // Send new snapshot to clients
        log.debug('Sending live view snapshot', { snapshot });
        this.socketio.emit('snapshot', snapshot);
    }

    /**
     * Initiates an async delete and does not wait for it to complete.
     * @param screenshotIndex
     * @ignore
     */
    _deleteScreenshot(screenshotIndex) {
        unlink(this._getScreenshotPath(screenshotIndex))
            .catch(err => log.exception(err, 'Cannot delete live view screenshot.'));
    }

    _setupHttpServer() {
        const containerPort = process.env[ENV_VARS.CONTAINER_PORT] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT];

        this.port = parseInt(containerPort, 10);
        if (!(this.port >= 0 && this.port <= 65535)) {
            throw new Error('Cannot start LiveViewServer - invalid port specified by the '
                + `${ENV_VARS.CONTAINER_PORT} environment variable (was "${containerPort}").`);
        }
        this.liveViewUrl = process.env[ENV_VARS.CONTAINER_URL] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_URL];

        this.httpServer = http.createServer();
        const app = express();

        app.use('/', express.static(__dirname));

        // Serves a JS file with the last snapshot, so the the client can immediately show something
        app.get('/init-last-snapshot.js', (req, res) => {
            res.set('Content-Type', 'text/javascript');
            res.send(`window.lastSnapshot = ${JSON.stringify(this.lastSnapshot, null, 2)};`);
        });

        // Serves JPEG with the last screenshot
        app.get('/screenshot/:index', (req, res) => {
            const screenshotIndex = req.params.index;
            const filePath = this._getScreenshotPath(screenshotIndex);
            res.sendFile(filePath);
        });

        app.all('*', (req, res) => {
            res.status(404).send('Nothing here');
        });

        this.httpServer.on('request', app);

        // Socket.io server used to send snapshots to client
        this.socketio = socketio(this.httpServer);
        this.socketio.on('connection', (socket) => {
            this.clientCount++;
            log.info('Live view client connected', { clientId: socket.id });
            socket.on('disconnect', (reason) => {
                this.clientCount--;
                log.info('Live view client disconnected', { clientId: socket.id, reason });
            });
        });
    }
}

export default LiveViewServer;
