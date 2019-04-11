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

const DEFAULT_SCREENSHOT_DIRECTORY_PATH = path.resolve('live_view');
const DEFAULT_MAX_SCREENSHOT_FILES = 10;


const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const ensureDir = promisify(fs.ensureDir);

export default class LiveViewServer {
    constructor(options = {}) {
        const {
            screenshotDirectoryPath = DEFAULT_SCREENSHOT_DIRECTORY_PATH,
            maxScreenshotFiles = DEFAULT_MAX_SCREENSHOT_FILES,
        } = options;

        const containerPort = process.env[ENV_VARS.CONTAINER_PORT] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT];

        this.port = parseInt(containerPort, 10);
        if (!(this.port >= 0 && this.port <= 65535)) {
            throw new Error('Cannot start LiveViewServer - invalid port specified by the '
                + `${ENV_VARS.CONTAINER_PORT} environment variable (was "${containerPort}").`);
        }
        this.liveViewUrl = process.env[ENV_VARS.CONTAINER_URL] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_URL];

        checkParamOrThrow(screenshotDirectoryPath, 'options.screenshotDirectoryPath', 'String');
        checkParamOrThrow(maxScreenshotFiles, 'options.maxScreenshotFiles', 'Number');
        this.screenshotDirectoryPath = screenshotDirectoryPath;
        this.maxScreenshotFiles = maxScreenshotFiles;

        // Snapshot data
        this.lastSnapshot = null;
        this.lastScreenshotIndex = 0;

        // Setup HTTP server and Express router
        this._isRunning = false;
        this.httpServer = http.createServer();
        this.app = express();

        this.app.use('/', express.static(__dirname));

        // Serves a JS file with the last snapshot, so the the client can immediately show something
        this.app.get('/init-last-snapshot.js', (req, res) => {
            res.set('Content-Type', 'text/javascript');
            res.send(`window.lastSnapshot = ${JSON.stringify(this.lastSnapshot, null, 2)};`);
        });

        // Serves JPEG with the last screenshot
        this.app.get('/screenshot/:index', (req, res) => {
            const screenshotIndex = req.params.index;
            const filePath = this.getScreenshotPath(screenshotIndex);
            res.sendFile(filePath);
        });

        this.app.all('*', (req, res) => {
            res.status(404).send('Nothing here');
        });

        this.httpServer.on('request', this.app);

        // Socket.io server used to send snapshots to client
        this.clientCount = 0;
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

    /**
     * Starts the HTTP server.
     */
    async start() {
        await ensureDir(this.screenshotDirectoryPath);
        await promisifyServerListen(this.httpServer)(this.port);
        log.info('Live view web server started', { publicUrl: this.liveViewUrl });
        this._isRunning = true;
    }

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

    async serve(page) {
        if (!this.hasClients()) return;
        const snapshot = await this._makeSnapshot(page);
        await this._pushSnapshot(snapshot);
    }

    get isRunning() {
        return this._isRunning;
    }

    hasClients() {
        return this.clientCount > 0;
    }

    getScreenshotPath(screenshotIndex) {
        return path.join(this.screenshotDirectoryPath, `${screenshotIndex}`);
    }

    async _makeSnapshot(page) {
        const pageUrl = page.url();
        log.info('Making live view snapshot.', { pageUrl });
        const [htmlContent, screenshot] = await Promise.all([
            page.content(),
            page.screenshot(),
        ]);

        const screenshotIndex = this.lastScreenshotIndex++;

        await writeFile(this.getScreenshotPath(screenshotIndex), screenshot);
        if (screenshotIndex > this.maxScreenshotFiles - 1) {
            this._deleteScreenshot(screenshotIndex - this.maxScreenshotFiles);
        }

        const snapshot = { pageUrl, htmlContent, screenshotIndex };
        this.lastSnapshot = snapshot;
        return snapshot;
    }

    /**
     * To be called when the snapshot of screen and HTML content was saved.
     */
    async _pushSnapshot(snapshot) {
        // Send new snapshot to clients
        log.info('Sending live view snapshot', { snapshot });
        this.socketio.emit('snapshot', snapshot);
    }

    _deleteScreenshot(screenshotIndex) { // eslint-disable-line class-methods-use-this
        unlink(this.getScreenshotPath(screenshotIndex))
            .catch(err => log.exception(err, 'Cannot delete live view screenshot.'));
    }
}
