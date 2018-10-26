---
id: utilslog
title: utils.log 
---

 <a name="utilslog"></a>

 Apify.utils contains various utilities for logging WARNING,ERROR,OFF,DEBUG.All logs are always kept.
 
 **Example usage:**
 ```javascript
 const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);
 ```
 
 ## `log.LEVELS.WARNING`
`log.setLevel(log.LEVELS.WARNING);`
 ## `log.LEVELS.ERROR`
`log.setLevel(log.LEVELS.ERROR);`
 ## `log.LEVELS.OFF`
`log.setLevel(log.LEVELS.OFF);`
 ## `log.LEVELS.DEBUG`
`log.setLevel(log.LEVELS.DEBUG);`
 ## `log.setLevel([logLevel])`
To turn off the logging of unimportant messages set log levels
 <table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[logLevel]</code></td><td><code>String</code></td><td><code>WARNING,ERROR,OFF,DEBUG</code></td>
</tr>
</tbody>
</table>