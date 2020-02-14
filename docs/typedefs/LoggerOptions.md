---
id: loggeroptions
title: LoggerOptions
---

<a name="LoggerOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[object.level]</code></td><td><code>number</code></td><td><code>4</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets the log level to the given value, preventing messages from less important log levels
from being printed to the console. Use in conjunction with the <code>log.LEVELS</code> constants.</p>
</td></tr><tr>
<td><code>[object.maxDepth]</code></td><td><code>number</code></td><td><code>4</code></td>
</tr>
<tr>
<td colspan="3"><p>Max depth of data object that will be logged. Anything deeper than the limit will be stripped off.</p>
</td></tr><tr>
<td><code>[object.maxStringLength]</code></td><td><code>number</code></td><td><code>2000</code></td>
</tr>
<tr>
<td colspan="3"><p>Max length of the string to be logged. Longer strings will be truncated.</p>
</td></tr><tr>
<td><code>[object.prefix]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Prefix to be prepended the each logged line.</p>
</td></tr><tr>
<td><code>[object.suffix]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Suffix that will be appended the each logged line.</p>
</td></tr><tr>
<td><code>[object.logger]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Logger implementation to be used. Default one is log.LoggerText to log messages as easily readable
strings. Optionally you can use <code>log.LoggerJson</code> that formats each log line as a JSON.</p>
</td></tr><tr>
<td><code>[object.data]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Additional data to be added to each log line.</p>
</td></tr></tbody>
</table>
