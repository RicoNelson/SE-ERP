# StockMate Deployment Guide

This guide explains how to deploy the `stockmate` app to Firebase Hosting.

## 1) Prerequisites

- Node.js 20+ and npm
- Firebase CLI installed globally:

```bash
npm install -g firebase-tools
```

- Access to a Firebase project with Hosting enabled

## 2) Project Structure

- App directory: `SE Inventory/stockmate`
- Hosting config: `stockmate/firebase.json`
- Default Firebase project alias: `se-erp-4c7fe` (from `stockmate/.firebaserc`)

## 3) Environment Setup

Inside `stockmate`, create `.env` from the example and fill all values:

```bash
cp .env.example .env
```

Required variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_RECAPTCHA_SITE_KEY`

## 4) Build and Validate

From `stockmate`:

```bash
npm install
npm run lint
npm run build
```

Expected output folder: `dist/`

## 5) Deploy to Firebase Hosting

From `stockmate`:

```bash
firebase login
firebase use se-erp-4c7fe
firebase deploy --only hosting
```

If you also changed Firestore rules:

```bash
firebase deploy --only hosting,firestore:rules
```

## 6) Deploy to a Different Firebase Project

If you need another project:

```bash
firebase use --add
```

Then select the desired project and deploy:

```bash
firebase deploy --only hosting
```

## 7) Post-Deploy Checks

- Open the deployed URL and verify login, stock pages, and report pages
- Confirm PWA assets load correctly (`manifest.webmanifest`, `sw.js`)
- Do a hard refresh once after deploy to ensure latest service worker is active

## 8) Troubleshooting

- `Missing environment variable`: confirm `.env` exists and all `VITE_*` keys are set
- `Permission denied`: ensure your Firebase account has access to the selected project
- `Old UI still appears`: clear browser cache or unregister old service worker and reload
