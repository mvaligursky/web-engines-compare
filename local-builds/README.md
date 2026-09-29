# local-builds

`playcanvas-local.mjs` is the PlayCanvas branch currently under test, which the
`PC local` column loads. That column is disabled by default: set `enabled: true`
on the `playcanvas-local` entry in `engines.config.js` while you measure a branch,
and keep it disabled in what gets pushed, as the live site has no local build.

Refresh the build from an engine checkout whenever the branch changes:

```sh
cd /path/to/engine            # the branch you are measuring
npm run build:rel:esm         # release build - never measure a debug build
cp build/playcanvas.mjs /path/to/web-engines-compare/local-builds/playcanvas-local.mjs
```

The file is deliberately not committed: it is a build artifact of whatever
branch was last measured. Published versions stay as CDN urls in
`engines.config.js`, so a run compares the working branch against releases.
