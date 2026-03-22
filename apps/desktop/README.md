# MSG Desktop (Electron)

Desktop app wrapper for the MSG web app.

## Setup

```bash
# From monorepo root
cd apps/desktop
npm init -y
npm install electron --save-dev
```

## Structure

- `main.js` - Electron main process (creates window, loads web app)
- `preload.js` - Preload script for secure context bridge

## Run

```bash
# Build web app first
npm run build -w @msg/web

# Run Electron (loads dist from apps/web)
npx electron .
```

## Package.json scripts

```json
{
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "npm run build -w @msg/web"
  }
}
```
