/*!
 * Apifier SDK for JavaScript.
 *
 * This is a work in progress.
 *
 * Author: Jan Curn (jan@apifier.com)
 * Copyright(c) 2016 Apifier. All rights reserved.
 *
 */
"use strict";

console.log("Apifier SDK for JavaScript");
console.log("Copyright(c) 2016 Apifier. All rights reserved.");
console.log("");



//exports.





const http = require('http');
const fs = require('fs');    // yyyyyy

console.log("Hello world !!!");
console.dir(process.env);

setTimeout( function() {

    const server = http.createServer((req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello World\n');
        console.log("Received message!!!");
        // console.dir(req);
    });
    server.listen(process.env.APIFIER_INTERNAL_PORT|0, function() {
        console.log("Listening on port : " + (process.env.APIFIER_INTERNAL_PORT|0));
        fs.writeFileSync("/apifier-truncate-when-ready", "");
    });

}, 10000);
