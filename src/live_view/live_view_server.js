const http = require('http');
const fs = require('fs');
const express = require('express');
const socketio = require('socket.io');
const utils = require('apify-shared/utilities');
const log = require('apify-shared/log');
const { ENV_VARS, LOCAL_ENV_VARS } = require('apify-shared/consts');

const DELETE_SCREENSHOT_FILE_TIMEOUT_MILLIS = 10 * 1000;

class LiveViewServer {
    constructor() {
        const containerPort = process.env[ENV_VARS.CONTAINER_PORT] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_PORT];

        this.port = parseInt(containerPort, 10);
        if (!(this.port >= 0 && this.port <= 65535)) {
            throw new Error(`Cannot start LiveViewServer - invalid port specified by the ${
                ENV_VARS.CONTAINER_PORT} environment variable (was "${containerPort}").`);
        }
        this.liveViewUrl = process.env[ENV_VARS.CONTAINER_URL] || LOCAL_ENV_VARS[ENV_VARS.CONTAINER_URL];

        // Snapshot data
        this.lastSnapshot = null;
        this.lastScreenshotIndex = 0;
        this.screenshotIndexToFilePath = {};

        // Setup HTTP server and Express router
        this.httpServer = http.createServer();
        this.app = express();

        this.app.use('/', express.static(__dirname));

        // Serves a JS file with the last snapshot, so the the client can immediately show something
        this.app.get('/init-last-snapshot.js', (req, res) => {
            res.set('Content-Type', 'text/javascript');
            res.send(`window.lastSnapshot = ${JSON.stringify(this.lastSnapshot, null, 2)};`);
        });

        // Serves JPEG with the last screenshot
        this.app.get('/screenshot', (req, res) => {
            const screenshotIndex = req.query.index;
            const filePath = this.screenshotIndexToFilePath[screenshotIndex];
            if (!filePath) {
                return res.status(404).send('Oops, there is no such screenshot.');
            }
            // TODO: Limit snapshot sizes to avoid choking the system (was 5MB),
            // return replacement image if too large
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
        await utils.promisifyServerListen(this.httpServer)(this.port);
        log.info('Live view web server started', { publicUrl: this.liveViewUrl });
    }

    /**
     * To be called when the snapshot of screen and HTML content was saved.
     */
    async pushSnapshot(screenshotFilePath, htmlContent, pageUrl) {
        log.info('LiveViewServer.pushSnapshot()', { pageUrl });

        const prevScreenshotIndex = this.lastScreenshotIndex;

        this.lastScreenshotIndex++;
        this.lastSnapshot = {
            pageUrl,
            htmlContent,
            screenshotIndex: this.lastScreenshotIndex
        };
        this.screenshotIndexToFilePath[this.lastScreenshotIndex] = screenshotFilePath;

        // Send new snapshot to clients
        log.info('Sending live view snapshot', { snapshot: this.lastSnapshot });
        this.socketio.emit('snapshot', this.lastSnapshot);

        // Delete screenshot after a while, maybe some client still wants to download it
        const prevFilePath = this.screenshotIndexToFilePath[prevScreenshotIndex];
        if (prevFilePath) {
            setTimeout(() => {
                delete this.screenshotIndexToFilePath[prevScreenshotIndex];
                log.debug('Deleting screenshot', { path: prevFilePath });
                fs.unlink(prevFilePath, (err) => {
                    if (err) log.exception(err, 'Cannot delete file', { path: prevFilePath });
                });
            }, DELETE_SCREENSHOT_FILE_TIMEOUT_MILLIS);
        }
    };

    hasClients() {
        return this.clientCount > 0;
    }
}


module.exports = LiveViewServer;
