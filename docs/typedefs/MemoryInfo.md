---
id: memory-info
title: MemoryInfo
---

<a name="memoryinfo"></a>

Describes memory usage of an Actor.

## Properties

### `totalBytes`

**Type**: `number`

Total memory available in the system or container

---

### `freeBytes`

**Type**: `number`

Amount of free memory in the system or container

---

### `usedBytes`

**Type**: `number`

Amount of memory used (= totalBytes - freeBytes)

---

### `mainProcessBytes`

**Type**: `number`

Amount of memory used the current Node.js process

---

### `childProcessesBytes`

**Type**: `number`

Amount of memory used by child processes of the current Node.js process

---
