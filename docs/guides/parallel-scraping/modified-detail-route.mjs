// This replaces the request.label === DETAIL branch of the if clause.
router.addHandler('DETAIL', async ({ request, page, log }) => {
    log.debug(`Extracting data: ${request.url}`);
    const urlPart = request.url.split('/').slice(-1); // ['sennheiser-mke-440-professional-stereo-shotgun-microphone-mke-440']
    const manufacturer = urlPart[0].split('-')[0]; // 'sennheiser'

    const title = await page.locator('.product-meta h1').textContent();
    const sku = await page
        .locator('span.product-meta__sku-number')
        .textContent();

    const priceElement = page
        .locator('span.price')
        .filter({
            hasText: '$',
        })
        .first();

    const currentPriceString = await priceElement.textContent();
    const rawPrice = currentPriceString.split('$')[1];
    const price = Number(rawPrice.replaceAll(',', ''));

    const inStockElement = page
        .locator('span.product-form__inventory')
        .filter({
            hasText: 'In stock',
        })
        .first();

    const inStock = (await inStockElement.count()) > 0;

    const results = {
        url: request.url,
        manufacturer,
        title,
        sku,
        currentPrice: price,
        availableInStock: inStock,
    };

    log.debug(`Saving data: ${request.url}`);

    // Send the data to the parent process
    // Depending on how you build your crawler, this line could instead be something like `context.pushData()`! Experiment, and see what you can build
    // highlight-next-line
    process.send(results);
});
