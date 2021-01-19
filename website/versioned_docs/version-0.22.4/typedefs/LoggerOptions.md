---
id: version-0.22.4-logger-options
title: LoggerOptions
original_id: logger-options
---

<a name="loggeroptions"></a>

## Properties

### `level`

**Type**: `number` <code> = 4</code>

Sets the log level to the given value, preventing messages from less important log levels from being printed to the console. Use in conjunction with
the `log.LEVELS` constants.

---

### `maxDepth`

**Type**: `number` <code> = 4</code>

Max depth of data object that will be logged. Anything deeper than the limit will be stripped off.

---

### `maxStringLength`

**Type**: `number` <code> = 2000</code>

Max length of the string to be logged. Longer strings will be truncated.

---

### `prefix`

**Type**: `string`

Prefix to be prepended the each logged line.

---

### `suffix`

**Type**: `string`

Suffix that will be appended the each logged line.

---

### `logger`

**Type**: `Object`

Logger implementation to be used. Default one is log.LoggerText to log messages as easily readable strings. Optionally you can use `log.LoggerJson`
that formats each log line as a JSON.

---

### `data`

**Type**: `Object`

Additional data to be added to each log line.

---
