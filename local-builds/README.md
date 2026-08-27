# local-builds

Drop custom single-file engine builds here (e.g. an unreleased PlayCanvas
`playcanvas.mjs` with optimizations to measure) and reference them from
`engines.config.js` with a relative url:

```js
url: './local-builds/playcanvas-2.23.0-dev.mjs'
```

Builds committed here get deployed to GitHub Pages with the site.
