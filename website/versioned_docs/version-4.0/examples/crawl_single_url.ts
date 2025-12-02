import { gotScraping } from 'got-scraping';

// Get the HTML of a web page
const { body } = await gotScraping({ url: 'https://www.example.com' });
console.log(body);
