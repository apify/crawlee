"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const got_scraping_1 = require("got-scraping");
// Get the HTML of a web page
const { body } = await (0, got_scraping_1.gotScraping)({ url: 'https://www.example.com' });
console.log(body);
