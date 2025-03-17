<br>![image.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/4c1dfd42-88b1-4ba3-a882-3abd30520983/13a681d6-376a-44f5-a3e5-615d0a632c98/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466XTSUZUFC%2F20250313%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20250313T043437Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEIX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIF50tMpfDZhtscRKr%2FCokeDlsGDoXHZu0UjHdUfyI8DDAiBgFKd%2BTRYB8ulqY2ZSlRUfSYnKvfqbcL8Wxr9iqGafVCqIBAjN%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMMKxox9zyB4U13CvWKtwD12JWRI6WrjwhW4E1jP6AxmGeiYO5cZX6J6LTXk8zn4Q8RnSbpXnzZ6o4I5Uwg%2Foa7qY2G0%2FmtwqrE%2BQvmoBM99TgxpjGxRuRVw3YV2z0OcDKY7P9wvDwOmX1wrGEd2OZIi7PNonWaNK3MY%2FCeFVaJXfUWMIQZb29Z46%2FRQHcdROje4e63rBPXl4SU1wD3KwYqbiwyfae487pL4z3zst%2BD6YIJlayMQcGDOPso8ijCMV2tHErlaPElrMkdS8qc6sC%2F2XFruv9hGWt%2Fh8zsjw9VocvQiGN2m%2FdJ1Yt5gP27xRwMOBXczW8O3O5Lfm2Dyarerzm2RPkjWuekdBKGTGJkxycHSSSa%2FVEOu5KHVUAC78AggwAPpkxTEFq8kyrWQcOdbeUm0E7UKexULmHBVvYemDL2zLosthQgNYazDy745OwaqKQ2g%2Bg5pmMG4AjKeZgy4OPjZuKEBPBTRzfMsLTiR9wL4PMjbE3W8KjzPemTeFYVwhS6ZTSSvF0w4TJw%2B3A62lmXKyRdMWC%2F5cAEdG3v7fXXaWGz0TNaOvFID7EWTFSRxA6g%2Fgfl2cDEAg4sK8mCIoVKaSHaR2NHhJaNvFjQing57WmSTGjK%2BMHvJrIiivPZ%2F4zqziHk%2Bd%2FD8kwp7rJvgY6pgHTkUa1hqbnIxoTiBnI3rux7hUF5hEWf8yhhR9uhBp0SCchb0oQ230X0o%2BRB2HScRzayKYUQCclbNx9gcoIlngc5g790w5a4FJ73yKEP%2BXOYzInnIfEGfiq4RimS1f1cT6bhMPx3RJSqksfAcJZg7u0msfB8q0fc21It1tweaoFLzdORTADozFsXb2QE1x931AoTH%2F21YgrGe3N2kQHUPjtxks%2B6frh&X-Amz-Signature=57c40a3f1f6eac5d1529b369e4dffb1e4376a84a5b243cbc9782b0d6e023f6d7&X-Amz-SignedHeaders=host&x-id=GetObject)

In this tutorial, we’ll build a price tracker using Crawlee for Python and Apify. By the end, you’ll have an Apify Actor that scrapes product details from a webpage, exports the data in various formats (CSV, Excel, JSON, and more), and sends an email alert when the product’s price falls below your specified threshold.

## **1. Project Setup**
Our first step is to install the [Apify CLI](https://docs.apify.com/cli/docs). You can do this using either Homebrew or NPM with the following commands:

### Homebrew
```Bash
install apify-cli
```
### Via NPM
```Bash
npm -g install apify-cli
```

Next, let’s run the following commands to use one of Apify’s pre-built templates. This will streamline the setup process and get us coding right away:

```Bash
apify create price-tracking-actor
```

A dropdown list will appear. To follow along with this tutorial, select **`Python`** and **`Crawlee + BeautifulSoup`** `template`. Once the template is installed, navigate to the newly created folder and open it in your preferred IDE.

![actor-templates](./img/actor-templates.webp)

Navigate to **`src/main.py`** in your project, and you’ll find that a significant amount of boilerplate code has already been generated for you. If you’re new to Apify or Crawlee, don’t worry, it’s not as complex as it might seem. This pre-written code is designed to save you time and streamline your development process.

![crawlee-bs4-template](./img/crawlee-bs4-template.webp)

In fact, this template comes with fully functional code that scrapes the Apify homepage. To test it out, simply run the command **`apify run`**. Within a few seconds, you’ll see the **`storage/datasets`** directory populate with the scraped data in JSON format.

![json-data](./img/json-data.webp)

## 2. Customizing the template
Now that our project is set up, let’s customize the template to scrape our target website: [Raspberry Pi 5 (8GB RAM) on Central Computer](https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html).
First, on the `src/main.py` file, go to the `start_urls` list and replace the current `url` with the target website, as shown below:

```Python
start_urls = [
            url.get('url') 
            for url in actor_input.get(
                'start_urls',
                [{'url': 'https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html'}],
            )
        ]
```

Next, update the URL in the **`storage/key_value_stores/INPUT.json`** file. The Actor template prioritizes user-provided input and only defaults to the predefined URL if none is given. To ensure our code runs correctly, replace the placeholder **“apify.com”** with our target website.<

```JSON
{
    "start_urls": [
        {
            "url": "https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html"
        }
    ]
}
```

![actor-input](./img/actor-input.webp)

### **Extracting the Product’s Name and Price**

Finally, let’s modify our template to extract key elements from the page, such as the product name and price.

Starting with the **product name**, inspect the [target page](https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html) using DevTools to find suitable selectors for targeting the element.

![product-name](./img/product-name.webp)

Next, create a `product_name_element` variable to hold the element selected with the CSS selectors found on the page and update the **`data`** dictionary with the element’s text contents. Also, remove the line of code that previously made the Actor crawl the Apify website, as we now want it to scrape only a single page.

Your **`request_handler`** function should look similar to the example below:

```python
@crawler.router.default_handler
async def request_handler(context: BeautifulSoupCrawlingContext) -> None:
    url = context.request.url<br>    Actor.log.info(f'Scraping {url}...')
    # Select the product name and price elements.
    product_name_element = context.soup.find('div', class_='productname')
    
    # Extract the desired data.
    data = {
        'url': context.request.url,
        'product_name': product_name_element.text.strip() if product_name_element else None,
    } 
    # Store the extracted data to the default dataset.
    await context.push_data(data)

    # Enqueue additional links found on the current page.    
    # await context.enqueue_links() -> REMOVE THIS LINE
```

It’s a good practice to test our code after every significant change to ensure it works as expected.

Run **`apify run`** again, but this time, add the **`–-purge`** flag to prevent the newly scraped data from mixing with previous runs:

```bash
apify run --purge
```

Navigate to `storage/datasets`, and you should find a file with the scraped content:

```json
{
    "url": "https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html",
    "product_name": "Raspberry Pi 5 8GB RAM Board"}
}
```

Now that you’ve got the hang of it, let’s do the same thing for the price: `79.99`.

![product_price.png](./img/product-price.webp)

In the code below, you’ll notice a slight difference: instead of extracting the element’s text content, we’re retrieving the value of its `data-price-amount` attribute. This approach avoids capturing the dollar sign `($)` that would otherwise come with the text.

If you prefer working with text content instead, that’s perfectly fine, you can simply use `.replace('$', '')` to remove the dollar sign.

Also, keep in mind that the extracted price will be a `string` by default. To perform numerical comparisons, we need to convert it to a `float`. This conversion will allow us to accurately compare the price values later on.

Here’s how the updated code looks so far:

```python
# main.py

# ...previous code

@crawler.router.default_handler
async def request_handle(context: BeautifulSoupCrawlingContext) -> None:
    url = context.request.url
    Actor.log.info(f'Scraping {url}...')

    # Select the product name and price elements.
    product_name_element = context.soup.find('div', class_='productname')
    product_price_element = context.soup.find('span', id='product-price-395001')

    # Extract the desired data.
    data = {
        'url': context.request.url,       
        'product_name': product_name_element.text.strip() if product_name_element else None,
        'price': float(product_price_element['data-price-amount']) if product_price_element else None,
    }

    # Store the extracted data to the default dataset.
    await context.push_data(data)
```
       
Again, try running it with `apify run --purge` and check if you get a similar output as the example below:

```json
{
    "url": "https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html", 
    "product_name": "Raspberry Pi 5 8GB RAM Board", 
    "price": 79.99
}
```

That’s it for the extraction part! Below is the complete code we’ve written so far.

>💡 **TIP:** If you’d like to get some more practice, try scraping additional elements such as the **`model`**, **`Item #`**, or **`stock availability (In stock)`**.

```python
# main.py
from apify import Actor<br>from crawlee.crawlers import BeautifulSoupCrawler, BeautifulSoupCrawlingContext<br><br>async def main() -> None:<br>    # Enter the context of the Actor.
    async with Actor:
        # Retrieve the Actor input, and use default values if not provided.
        actor_input = await Actor.get_input() or {}
        start_urls = [
                    url.get('url')
                    for url in actor_input.get(
                        'start_urls',
                        [{
                            'url': 'https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html'}],
                                )]
            # Exit if no start URLs are provided.<br>        if not start_urls:<br>            Actor.log.info('No start URLs specified in Actor input, exiting...')<br>            await Actor.exit()<br>        # Create a crawler.<br>        crawler = BeautifulSoupCrawler(<br>            # Limit the crawl to max requests. Remove or increase it for crawling all links.<br>            max_requests_per_crawl=50,<br>        )<br>        # Define a request handler, which will be called for every request.<br>        @crawler.router.default_handler<br>        async def request_handler(context: BeautifulSoupCrawlingContext) -> None:<br>            url = context.request.url<br>            Actor.log.info(f'Scraping {url}...')<br>            <br>            # Select the product name and price elements.<br>            product_name_element = context.soup.find('div', class_='productname')<br>            product_price_element = context.soup.find('span', id='product-price-395001')<br>            # Extract the desired data.<br>            data = {<br>                'url': context.request.url,<br>                'product_name': product_name_element.text.strip() if product_name_element else None,<br>                'price': float(product_price_element['data-price-amount']) if product_price_element else None,<br>            }<br>            # Store the extracted data to the default dataset.<br>            await context.push_data(data)<br>        # Run the crawler with the starting requests.<br>        await crawler.run(start_urls)<br>
```
                                                                                

## 3. Sending an Email Alert

From this point forward, you’ll need an **Apify account**. You can create one for free [here](https://console.apify.com/sign-up).

We need an Apify account because we’ll be making an API call to a pre-existing Actor from the **Apify Store,** the “Send Email Actor”, to handle notifications. Apify’s email system takes care of sending alerts, so we don’t have to worry about handling **2FA** in our automation.

```python
# main.py
# ...previous code
# Define a price threshold
price_threshold = 80
# Call the \"Send Email\" Actor when the price goes below the threshold            
if data['price'] < price_threshold:
        actor_run = await Actor.start(
                    actor_id=\"apify/send-mail\",
                            run_input={
                \"to\": \"your_email@email.com\",
                            \"subject\": \"Python Price Alert\",
            \"text\": f\"The price of '{data['product_name']}' has dropped below ${price_threshold} and is now ${data['price']}.\\n\\nCheck it out here: {data['url']}\",        },    )
    Actor.log.info(f\"Email sent with run ID: {actor_run.id}\")
```

In the code above, we’re using the **Apify Python SDK**, which is already included in our project, to call the “Send Email” Actor with the required input.<br><br>To make this API call work, you’ll need to log in to your Apify account from the terminal using your **`APIFY_API_TOKEN`**.

To get your **`APIFY_API_TOKEN`**, sign up for an Apify account, then navigate to **Settings → API & Integrations**, and copy your **Personal API token**.

![apify-api-token](./img/apify-api-token.webp)

Next, enter the following command in the terminal inside your **Price Tracking Project**:<br><br>```python<br>apify login<br>```

Select `Enter API Token Manually` , paste the token you copied from your account and hit enter.

![image.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/4c1dfd42-88b1-4ba3-a882-3abd30520983/b07bf1f1-3845-4109-95ad-ff754b0e9aef/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB466XTSUZUFC%2F20250313%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20250313T043437Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEIX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJGMEQCIF50tMpfDZhtscRKr%2FCokeDlsGDoXHZu0UjHdUfyI8DDAiBgFKd%2BTRYB8ulqY2ZSlRUfSYnKvfqbcL8Wxr9iqGafVCqIBAjN%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F8BEAAaDDYzNzQyMzE4MzgwNSIMMKxox9zyB4U13CvWKtwD12JWRI6WrjwhW4E1jP6AxmGeiYO5cZX6J6LTXk8zn4Q8RnSbpXnzZ6o4I5Uwg%2Foa7qY2G0%2FmtwqrE%2BQvmoBM99TgxpjGxRuRVw3YV2z0OcDKY7P9wvDwOmX1wrGEd2OZIi7PNonWaNK3MY%2FCeFVaJXfUWMIQZb29Z46%2FRQHcdROje4e63rBPXl4SU1wD3KwYqbiwyfae487pL4z3zst%2BD6YIJlayMQcGDOPso8ijCMV2tHErlaPElrMkdS8qc6sC%2F2XFruv9hGWt%2Fh8zsjw9VocvQiGN2m%2FdJ1Yt5gP27xRwMOBXczW8O3O5Lfm2Dyarerzm2RPkjWuekdBKGTGJkxycHSSSa%2FVEOu5KHVUAC78AggwAPpkxTEFq8kyrWQcOdbeUm0E7UKexULmHBVvYemDL2zLosthQgNYazDy745OwaqKQ2g%2Bg5pmMG4AjKeZgy4OPjZuKEBPBTRzfMsLTiR9wL4PMjbE3W8KjzPemTeFYVwhS6ZTSSvF0w4TJw%2B3A62lmXKyRdMWC%2F5cAEdG3v7fXXaWGz0TNaOvFID7EWTFSRxA6g%2Fgfl2cDEAg4sK8mCIoVKaSHaR2NHhJaNvFjQing57WmSTGjK%2BMHvJrIiivPZ%2F4zqziHk%2Bd%2FD8kwp7rJvgY6pgHTkUa1hqbnIxoTiBnI3rux7hUF5hEWf8yhhR9uhBp0SCchb0oQ230X0o%2BRB2HScRzayKYUQCclbNx9gcoIlngc5g790w5a4FJ73yKEP%2BXOYzInnIfEGfiq4RimS1f1cT6bhMPx3RJSqksfAcJZg7u0msfB8q0fc21It1tweaoFLzdORTADozFsXb2QE1x931AoTH%2F21YgrGe3N2kQHUPjtxks%2B6frh&X-Amz-Signature=b3241f0f325326fcc9d0f15f27ddd810fefd930cc34c861f0600f45ccdb5373c&X-Amz-SignedHeaders=host&x-id=GetObject)

You’ll see a confirmation that you’re now logged into your Apify account. When you run the code, the API token will be automatically inferred from your account, allowing you to use the **Send Email Actor**.

If you encountered any issues, double-check that your code matches the one below:

```python
from apify import Actor<br>from crawlee.crawlers import BeautifulSoupCrawler, BeautifulSoupCrawlingContext<br><br>async def main() -> None:<br>    # Enter the context of the Actor.<br>    async with Actor:<br>        # Retrieve the Actor input, and use default values if not provided.<br>        actor_input = await Actor.get_input() or {}<br>        start_urls = [<br>            url.get('url')<br>            for url in actor_input.get(<br>                'start_urls',<br>                [{'url': 'https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html'}],<br>            )<br>        ]<br>        # Exit if no start URLs are provided.<br>        if not start_urls:<br>            Actor.log.info('No start URLs specified in Actor input, exiting...')<br>            await Actor.exit()<br>        # Create a crawler.<br>        crawler = BeautifulSoupCrawler(<br>            # Limit the crawl to max requests. Remove or increase it for crawling all links.<br>            max_requests_per_crawl=50,<br>        )<br>        # Define a request handler, which will be called for every request.<br>        @crawler.router.default_handler<br>        async def request_handler(context: BeautifulSoupCrawlingContext) -> None:<br>            url = context.request.url<br>            Actor.log.info(f'Scraping {url}...')<br>            <br>            # Select the product name and price elements.<br>            product_name_element = context.soup.find('div', class_='productname')<br>            product_price_element = context.soup.find('span', id='product-price-395001')<br>            # Extract the desired data.<br>            data = {<br>                'url': context.request.url,<br>                'product_name': product_name_element.text.strip() if product_name_element else None,<br>                'price': float(product_price_element['data-price-amount']) if product_price_element else None,<br>            }<br>            <br>            price_threshold = 80<br>            <br>            if data['price'] < price_threshold:<br>                actor_run = await Actor.start(<br>                    actor_id=\"apify/send-mail\",<br>                    run_input={<br>                        \"to\": \"your_email@gmail.com\",<br>                        \"subject\": \"Python Price Alert\",<br>                        \"text\": f\"The price of '{data['product_name']}' has dropped below ${price_threshold} and is now ${data['price']}.\\n\\nCheck it out here: {data['url']}\",<br>                    },<br>                )<br>                Actor.log.info(f\"Email sent with run ID: {actor_run.id}\")<br>            # Store the extracted data to the default dataset.<br>            await context.push_data(data)<br>        # Run the crawler with the starting requests.<br>        await crawler.run(start_urls)<br>
```

> 🔖 Replace the placeholder email address with your actual email, the one where you want to receive notifications. Make sure it matches the email you used to register your **Apify account**.

Then, run the code using:

```bash
apify run --purge
```

If everything works correctly, you should receive an email like the one below in your inbox.

![price-alert](./img/price-alet.webp)

## 4. Deploying your Actor

It’s time to deploy your Actor to the cloud, allowing it to take full advantage of the Apify Platform’s features.

Fortunately, this process is incredibly simple. Since you’re already logged into your account, just run the following command:

```bash
apify push
```

In just a few seconds, you’ll find your newly created Actor in your Apify account by navigating to **Actors → Development → Price Tracking Actor**.

![price-tracking-actor](./img/price-tracking-actor.webp)

Note that the **Start URLs** input has been reset to **apify.com**, so be sure to replace it with our target website:

[https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html](https://www.centralcomputer.com/raspberry-pi-5-8gb-ram-board.html)

Once updated, click the green _**Save & Start**_ button at the bottom of the page to run your Actor.

After the run completes, you’ll see a **preview of the results** in the _**Output**_ tab. You can also export your data in multiple formats from the _**Storage**_ tab.
 
![actor-run](./img/actor-run.webp)
 
**Export dataset:**

![actor-export-dataset](./img/export-dataset.webp)
 
## 5. Schedule your runs
 
Now, a **price monitoring script** wouldn’t be very effective unless it ran on a schedule, automatically checking the product’s price and notifying us when it drops below the threshold.
 
Since our Actor is already deployed on the **Apify Platform**, scheduling it to run, say, every hour, is incredibly simple.
 
On your Actor page, click the three dots in the top-right corner of the screen and select **“Schedule Actor.”**

![schedule-run](./img/schedule-run.webp)
 
Next, choose how often you want your Actor to run, and that’s it! Your script will now run in the cloud, continuously monitoring the product’s price and sending you an email notification whenever it goes on sale.

![actor-schedule](./img/actor-schedule.webp)
 
## That’s a wrap!
 
Congratulations on completing this tutorial! I hope you enjoyed getting your feet wet with Crawlee and feel confident enough to tweak the code to build your own price tracker.
 
We’ve only scratched the surface of what Apify and Crawlee can do. As a next step, join our [Discord community](https://discord.com/invite/jyEM2PRvMU) to connect with other web scraping developers and stay up to date with the latest news about Crawlee and Apify!
 