router.addHandler('CATEGORY', async ({ page, enqueueLinks, request, log }) => {
    log.debug(`Enqueueing pagination for: ${request.url}`);
    // We are now on a category page. We can use this to paginate through and enqueue all products,
    // as well as any subsequent pages we find

    await page.waitForSelector('.product-item > a');
    await enqueueLinks({
        selector: '.product-item > a',
        label: 'DETAIL', // <= note the different label,
        // highlight-next-line
        requestQueue: await getOrInitQueue(), // <= note the different request queue
    });

    // Now we need to find the "Next" button and enqueue the next page of results (if it exists)
    const nextButton = await page.$('a.pagination__next');
    if (nextButton) {
        await enqueueLinks({
            selector: 'a.pagination__next',
            label: 'CATEGORY', // <= note the same label
        });
    }
});
