---
id: environmentvariables
title: Environment Variables
---

The following table shows the basic environment variables used by Apify SDK:

<table>
    <thead>
        <tr>
            <th>Environment variable</th>
            <th>Description</th>
        </tr>
    </thead>
    <tbody>
          <tr>
            <td><code>APIFY_LOCAL_STORAGE_DIR</code></td>
            <td>
              Defines the path to a local directory where
              <a href="../api/keyvaluestore">key-value stores</a>,
              <a href="../api/requestlist">request lists</a>
              and <a href="../api/requestqueue">request queues</a> store their data.
              Typically it is set to <code>./apify_storage</code>.
              If omitted, you should define
              the <code>APIFY_TOKEN</code> environment variable instead.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_TOKEN</code></td>
            <td>
              The API token for your Apify Account. It is used to access the Apify API, e.g. to access cloud storage or to run an actor in the Apify Cloud.
              You can find your API token on the <a href="https://my.apify.com/account#intergrations" target="_blank">Account - Integrations</a> page.
              If omitted, you should define the <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable instead.
            </td>
          </tr>
          <tr>
            <td><code>APIFY_PROXY_PASSWORD</code></td>
            <td>
              Optional password to <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a> for IP address rotation.
              If you have have an Apify Account, you can find the password on the
              <a href="https://my.apify.com/proxy" target="_blank">Proxy page</a> in the Apify app.
              This feature is optional. You can use your own proxies or no proxies at all.
            </td>
          </tr>
          <tr>
              <td><code>APIFY_HEADLESS</code></td>
              <td>
                If set to <code>1</code>, web browsers launched by Apify SDK will run in the headless
                mode. You can still override this setting in the code, e.g. by
                passing the <code>headless: true</code> option to the
                <a href="../api/apify#module_Apify.launchPuppeteer"><code>Apify.launchPuppeteer()</code></a>
                function. But having this setting in an environment variable allows you to develop
                the crawler locally in headful mode to simplify the debugging, and only run the crawler in headless
                mode once you deploy it to the Apify Cloud.
                By default, the browsers are launched in headful mode, i.e. with windows.
              </td>
          </tr>
          <tr>
              <td><code>APIFY_LOG_LEVEL</code></td>
              <td>
                Specifies the minimum log level, which can be one of the following values (in order of severity):
                <code>DEBUG</code>, <code>INFO</code>, <code>WARNING</code>, <code>SOFT_FAIL</code> and <code>ERROR</code>.
                By default, the log level is set to <code>INFO</code>, which means that <code>DEBUG</code> messages
                are not printed to console.
              </td>
          </tr>
          <tr>
              <td><code>APIFY_MEMORY_MBYTES</code></td>
              <td>
                Sets the amount of system memory in megabytes to be used by the
                <a href="../api/autoscaledpool">autoscaled pool</a>.
                It is used to limit the number of concurrently running tasks. By default, the max amount of memory
                to be used is set to one quarter of total system memory, i. e. on a system with 8192 MB of memory,
                the autoscaling feature will only use up to 2048 MB of memory.
              </td>
          </tr>
    </tbody>
</table>
