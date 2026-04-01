# SE-ERP (StockMate PWA)

StockMate is a mobile-first inventory and point-of-sale web app (PWA) for small stores. It replaces manual invoice-based tracking with fast sales entry, stock-in receipts, and real-time inventory visibility. The repository includes a React PWA frontend and an optional Firebase Functions backend for invoice photo extraction using Google Vision + Gemini.

## What it does

- Owner and Staff roles with phone OTP login (Firebase Auth)
- Sales flow that deducts stock immediately and writes stock movement history
- Stock-in (PB) flow with supplier receipt tracking
- Product catalog management with low-stock alerts
- Reports for sales, stock movements, and operating expenses
- Optional invoice photo → PB draft extraction (AI)
- Offline-ready PWA with service worker caching

## Tech stack

- Frontend: React + TypeScript + Vite + Tailwind + PWA
- Backend: Firebase Cloud Functions (Node 20)
- Data: Firebase Firestore, Storage, Auth, App Check
- AI (optional): Google Vision API + Gemini API

## Repository structure

- stockmate/ — Frontend PWA
- stockmate-backend/ — Cloud Functions for invoice extraction
- docs/ — Product + deployment specs

## Quick start (frontend)

1) Prepare environment

```bash
cd stockmate
cp .env.example .env
```

Fill the values in `.env`:

- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID
- VITE_RECAPTCHA_SITE_KEY
- VITE_INVOICE_EXTRACT_URL (optional, see backend section)
- VITE_STORE_NAME (nama toko yang tampil di aplikasi)

2) Install and run

```bash
npm install
npm run dev
```

## Backend (optional: invoice extraction)

This backend provides a single authenticated endpoint to extract invoice photos into PB drafts.

1) Install and login

```bash
cd stockmate-backend
npm install
firebase login
firebase use <your_firebase_project_id>
```

2) Set the Gemini API key (Secret Manager)

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

3) Local emulator

```bash
npm run serve
```

4) Deploy

```bash
npm run build
firebase deploy --only functions
```

5) Connect frontend

Set `VITE_INVOICE_EXTRACT_URL` to the function URL:

```
https://asia-southeast1-<your_project_id>.cloudfunctions.net/invoiceExtract
```

## Firebase setup

Enable these services in your Firebase project:

- Authentication → Phone provider
- Firestore Database
- Storage
- App Check (reCAPTCHA v3 for web)

### 1) Create and configure Firebase project

1. Create a Firebase project in Firebase Console.
2. Add a Web App inside the project and copy the config values.
3. Put the values into `stockmate/.env`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_STORE_NAME` (contoh: `SE Works`)
4. In Authentication, enable **Phone** sign-in.
5. In Firestore, create the database in production mode (or test mode for local trials).
6. In Storage, create the default bucket.
7. In App Check, register your web app with reCAPTCHA v3 and set `VITE_RECAPTCHA_SITE_KEY`.

### 2) Connect local project to Firebase

From `stockmate`:

```bash
firebase login
firebase use <your_firebase_project_id>
```

From `stockmate-backend`:

```bash
firebase login
firebase use <your_firebase_project_id>
```

### 3) Deploy frontend and rules

From `stockmate`:

```bash
npm install
npm run build
firebase deploy --only hosting
```

If you change Firestore or Storage security rules, deploy them too:

```bash
firebase deploy --only firestore:rules,storage
```

## Google Vision API setup (for invoice OCR)

The AI invoice extraction endpoint in `stockmate-backend` uses Google Vision OCR before Gemini normalization.

1. Open Google Cloud Console for the same project linked to Firebase.
2. Enable billing on that GCP project.
3. Enable these APIs:
   - Vision API
   - Gemini API (or Vertex AI API)
   - Secret Manager API
   - Cloud Functions API
4. Ensure the Cloud Functions runtime service account has permission to access Vision API and Secret Manager.

## Gemini setup (for invoice JSON extraction)

The backend reads `GEMINI_API_KEY` from Firebase Functions secrets.

1. Create a Gemini API key in Google AI Studio or your approved GCP flow.
2. Save the key to Firebase secret manager:

```bash
cd stockmate-backend
firebase functions:secrets:set GEMINI_API_KEY
```

3. Build and deploy backend:

```bash
npm install
npm run build
firebase deploy --only functions
```

4. Copy your deployed function URL into `stockmate/.env`:
   - `VITE_INVOICE_EXTRACT_URL=https://asia-southeast1-<your_project_id>.cloudfunctions.net/invoiceExtract`

5. Restart frontend dev server after `.env` changes:

```bash
cd stockmate
npm run dev
```

### Quick validation checklist

- Owner user can log in with phone OTP.
- Frontend can read/write Firestore documents.
- Storage upload works for invoice images.
- Calling invoice extraction returns a draft instead of permission/API errors.
- Nama toko tampil sesuai `VITE_STORE_NAME` di halaman login, header, dan profil.

### Common setup errors

- `auth/billing-not-enabled` when sending OTP: upgrade Firebase project to Blaze and ensure billing is active.
- `auth/invalid-app-credential` or `auth/captcha-check-failed`: verify domain allowlist in Firebase Auth, ensure App Check + reCAPTCHA key is correct, then refresh the page.
- OTP works locally but fails on deployed site: add your production domain to Firebase Authorized Domains.
- Firestore `Missing or insufficient permissions`: deploy Firestore rules and confirm logged-in phone number exists in `users/{phoneNumber}` with correct role.
- Storage upload permission denied: deploy Storage rules and verify bucket/project match your `VITE_FIREBASE_STORAGE_BUCKET`.
- Function returns 401/403: send Firebase ID token in `Authorization: Bearer <token>` and ensure user role is owner.
- Function returns Gemini quota/429 errors: check Gemini project quota, wait for retry window, or increase quota.
- Function returns Vision/API not enabled errors: enable Vision API and Cloud Functions API in the same GCP project used by Firebase.
- `VITE_INVOICE_EXTRACT_URL belum diatur`: set `VITE_INVOICE_EXTRACT_URL` in `stockmate/.env` and restart `npm run dev`.
- Secret not found (`GEMINI_API_KEY`): run `firebase functions:secrets:set GEMINI_API_KEY` and redeploy functions.

### Seed the first owner

Users are stored in Firestore under `users/{phoneNumber}`. The app only allows login for phone numbers that already exist in this collection.

Create the first owner document manually in Firestore:

```json
{
  "phoneNumber": "+62xxxxxxxxxxx",
  "name": "Owner Name",
  "role": "owner"
}
```

After the owner logs in, they can add staff users from the Users page.

## Data model (core collections)

- users (owner/staff access control)
- products (catalog with stockQty and pricing)
- purchases (PB headers)
- purchase_items (PB line items)
- inventory_layers (FIFO stock layers)
- stock_movements (audit trail)
- sales (POS transactions)
- operating_expenses (reporting)
- product_name_keys (name normalization)
- ai_invoice_drafts (optional AI output)
- system_counters (monthly AI usage limit)

## Customizing for your needs

- Role policy: update access gates in the frontend and Firestore rules to match your organization.
- Data fields: extend product or sales schemas in `stockmate/src/types` and update related pages.
- Multi-store: add `storeId` to every document and gate queries by store.
- Reporting: add new aggregates by reading `sales`, `stock_movements`, and `operating_expenses`.
- AI extraction: adjust extraction prompt or mapping logic in `stockmate-backend/src/index.ts`.

## Deployment

Frontend hosting uses Firebase Hosting. Backend uses Firebase Functions.

See the detailed guide: docs/deployment-guide.md

## Documentation

- docs/prd.md — product requirements
- docs/deployment-guide.md — Firebase hosting steps
- docs/invoice-ai-pb-implementation-plan.md — AI extraction design
