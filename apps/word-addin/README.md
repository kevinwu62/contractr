# Contractr Word Add-in

This is the first Microsoft Word task pane add-in skeleton for Contractr.

## What It Does

- Opens a simple task pane titled `Contractr`.
- Shows a `Read Selected Text` button.
- Uses Office.js to read the current Word selection.
- Displays the selected text in the task pane.

## Local Setup

Run these commands from `apps/word-addin/`:

```bash
npm install
npm run certs:install
npm run dev
```

`npm install` downloads local development dependencies. It creates `node_modules/`, which is ignored by Git, and `package-lock.json`, which is safe to commit.

`npm run certs:install` creates and trusts a localhost development certificate using Microsoft’s Office add-in certificate tooling. On macOS, you may be asked for your Mac password or asked to approve the certificate in Keychain.

`npm run dev` starts the local HTTPS dev server at the same URL used by `manifest.xml`:

```text
https://localhost:3000/index.html
```

## Sideload In Word On Mac

1. Install or verify the local certificate with `npm run certs:install`.
2. Start the dev server with `npm run dev`.
3. In Word for Mac, open a dummy document.
4. Open the add-in sideload menu. In many Word for Mac versions, this is under `Insert > Add-ins > My Add-ins > Upload My Add-in`.
5. Choose `apps/word-addin/manifest.xml`.
6. Select dummy text in Word.
7. Click `Read Selected Text` in the Contractr task pane.

If Word still shows a certificate warning, quit and reopen Word after installing the certificate, then sideload the manifest again.

Use only dummy contracts, public contracts, or sanitized text while testing.
