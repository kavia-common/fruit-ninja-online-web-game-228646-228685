# GameFrontend Troubleshooting

## Preview on port 3000 not working

### Symptom
- Nothing is listening on port `3000`, or the preview URL fails to load.

### Common cause: dependencies not installed
If you see this error when starting:

```
sh: 1: react-scripts: not found
```

it means `node_modules` (and therefore `react-scripts`) is missing.

### Fix
From `GameFrontend/`:

```sh
npm ci --no-audit --no-fund
npm start
```

In headless/CI environments you can also run:

```sh
PORT=3000 BROWSER=none CI=true npm start
```

### Notes
Startup may show non-blocking warnings such as:
- Browserslist DB out of date
- ESLint warnings about unused variables
These do not prevent the dev server from running.
