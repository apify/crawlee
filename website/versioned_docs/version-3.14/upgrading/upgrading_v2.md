---
id: upgrading-to-v2
title: Upgrading to v2
---

- **BREAKING**: Require Node.js >=15.10.0 because HTTP2 support on lower Node.js versions is very buggy.
- **BREAKING**: Bump `cheerio` to `1.0.0-rc.10` from `rc.3`. There were breaking changes in `cheerio` between the versions so this bump might be breaking for you as well.
- Remove `LiveViewServer` which was deprecated before release of SDK v1.
