---
id: memory-info
title: MemoryInfo
---

<a name="memoryinfo"></a>

Describes memory usage of an Actor.

## Properties

### `totalBytes`

**Type**: `Number`

Total memory available in the system or container

---

### `freeBytes`

**Type**: `Number`

Amount of free memory in the system or container

---

### `usedBytes`

**Type**: `Number`

Amount of memory used (= totalBytes - freeBytes)

---

### `mainProcessBytes`

**Type**: `Number`

Amount of memory used the current Node.js process

---

### `childProcessesBytes`

**Type**: `Number`

Amount of memory used by child processes of the current Node.js process

---
