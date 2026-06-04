# Stealth patched-Firefox launcher (proposal)

> Status: Draft proposal / interest check
> Tracking discussion: TBD

## Goal

A drop-in firefox launcher for PlaywrightCrawler backed by a Firefox 150 binary
with fingerprint patches applied at the C++ source level, for the cases where the
built-in fingerprint spoofing + handleCloudflareChallenge still get challenged
(see #3629).

## Why this is a small lift here

crawlee already supports swapping the browser engine through
`launchContext.launcher`, and there is already a guide for pointing it at a
patched Firefox: `docs/guides/avoid_blocking_camoufox.ts` launches camoufox via

```ts
launchContext: {
    launcher: firefox,
    launchOptions: await launchOptions({ headless: true }),
},
browserPoolOptions: { useFingerprints: false },
```

So the seam already exists. This proposal is the same shape with a different
binary: point `launchOptions.executablePath` at the patched firefox and pass the
spoof config through `launchOptions.firefoxUserPrefs` (the binary is fully
pref-driven). No new launcher abstraction needed.

```ts
import { firefox } from 'playwright';
import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    browserPoolOptions: { useFingerprints: false },
    launchContext: {
        launcher: firefox,
        launchOptions: {
            executablePath: '/path/to/patched/firefox',
            firefoxUserPrefs: { /* spoof prefs */ },
        },
    },
});
```

## Why a patched binary vs the JS-layer fingerprint spoofing

The built-in fingerprint injection and camoufox both operate at the JS layer on
top of the engine. A build patched at the C++ source level (canvas readback,
webgl getParameter, font metrics, audio, navigator, system colors) has no JS shim
and no CDP attach signature, so the values come back through the normal Gecko
paths with nothing for anti-bot lie-detectors to enumerate. it removes the
js-shim-and-detection-surface part; IP reputation and server-side scoring still
apply.

The binary lives at https://github.com/feder-cr/invisible_firefox (MPL-2, same
license family as Firefox upstream).

## Out of scope

No change to the default chromium path or the existing fingerprint stack. Firefox
stays an opt-in launcher choice, exactly like the camoufox guide.

## Honest caveats

- the invisible_playwright wrapper is Python, so it does not drop into a TS
  codebase; what is reusable here is the firefox binary itself, launched from
  playwright-node via executablePath + firefoxUserPrefs (same pattern as the
  camoufox guide).
- helps the fingerprint/engine layer only, not IP reputation or solving a
  Press & Hold once it has fired.
- firefox via playwright has no CDP, so anything CDP-specific stays chromium-only.

If a docs guide + an example (mirroring avoid_blocking_camoufox.ts) is in scope, i
can write it. if not, happy to close without noise.
