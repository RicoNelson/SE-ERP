# Invoice Photo → PB Auto-Fill Implementation Plan (Aligned with `StockAdd.tsx`)

## Goal
Add invoice photo import that fills the existing PB form flow in `StockAdd.tsx` without replacing current validation/transaction logic.

## Decision: Vision Only vs Vision + Gemini
- **Chosen approach:** use **Google Vision API + Gemini API** from the start.
- **Reason:** Vision handles OCR extraction; Gemini converts noisy OCR into strict PB-ready JSON.
- **Trade-off:** slightly higher cost and setup complexity, but better robustness for mixed supplier invoice layouts.
- **Risk control:** keep deterministic product mapping + confidence thresholds as final gate, so AI extraction never bypasses user review.

## Baseline Alignment with Current Add PB Flow
- PB form state is `poDraft` with shape: `receiptCode`, `receiptDate`, `supplierName`, `note`, `idempotencyKey`, `rows[]`.
- PB row state is `PoDraftRow`: `productNameInput`, `selectedProductId`, `qty`, `buyPrice`, `sellPrice`, `inlineProductEnabled`, `inlineProductForm`.
- Existing PB save path is `handleSavePurchaseOrder` and must remain single source of truth for final persistence.
- Existing query-param prefill pattern already exists (`productId`) and should be extended, not replaced.
- Existing data normalization should be preserved (uppercase input and formatted number strings before save).

## Integration Contract (What AI must return to fit `poDraft`)
AI draft payload must be directly mappable to current PB form fields:

```json
{
  "supplierName": "PT SUPPLIER",
  "receiptCode": "STRUK-001",
  "receiptDate": "2026-03-29",
  "note": "",
  "rows": [
    {
      "rawName": "KABEL HDMI 2M",
      "mappedProductId": "abc123",
      "qty": 10,
      "buyPrice": 25000,
      "sellPrice": 35000,
      "confidence": 0.96,
      "candidates": []
    }
  ]
}
```

Mapping to `poDraft`:
- `receiptCode` -> `poDraft.receiptCode` (uppercase)
- `receiptDate` -> `poDraft.receiptDate` (`YYYY-MM-DD`)
- `supplierName` -> `poDraft.supplierName` (uppercase)
- `rows[].mappedProductId` -> `selectedProductId`
- `rows[].rawName` -> fallback `productNameInput`
- numeric values -> formatted strings for `qty`, `buyPrice`, `sellPrice`
- `inlineProductEnabled` always starts `false` for AI-imported rows

## Frontend Changes in `StockAdd.tsx`
1. PB Header Action
- Add `Foto Invoice` button only inside `tab === 'pb'` section.
- Trigger camera/gallery input and upload flow.

2. Query Flow
- Extend current query usage:
  - keep `tab=pb` behavior
  - add `aiDraftId=<id>`
- On load:
  - if `aiDraftId` exists and draft is valid, hydrate `poDraft` from draft
  - remove `aiDraftId` from URL after successful apply (same style as `productId` cleanup)

3. Draft Hydration Rules
- Hydrate only when current PB draft is still empty-equivalent (same concept as current `hasEmptyDraft` check).
- If user already typed data, do not overwrite silently.
- Generate fresh `id` for each `PoDraftRow`.
- Keep rows fully editable through existing `PoRowEditor`.

4. Row Confidence UI (non-blocking)
- Add badge in each PB row:
  - `Tinggi` (`>= 0.93`) auto-mapped
  - `Perlu Cek` (`0.75-0.92`) suggested match
  - `Belum Cocok` (`< 0.75`) manual mapping
- Do not alter existing validation messages in `poRowErrors`.

5. Candidate Assistance
- For medium confidence rows, show quick action to apply top candidate product.
- For low confidence rows, keep `selectedProductId = null` and let existing search UX handle manual selection.

## Backend Design (for secure AI processing)
1. Endpoint
- `POST /ai/invoice/extract`
- Validates Firebase Auth token and owner role.
- Runs Vision OCR + Gemini JSON extraction + product mapping.
- Saves result to `ai_invoice_drafts/{draftId}`.
- Returns `draftId`.

2. Draft Data for Frontend
- `ai_invoice_drafts/{draftId}` includes:
  - `supplierName`, `receiptCode`, `receiptDate`, `note`
  - `rows[]` with `rawName`, `mappedProductId`, `qty`, `buyPrice`, `sellPrice`, `confidence`, `candidates[]`
  - `createdBy`, `createdAt`, `status`

3. Security
- API keys only on server environment.
- No Vision/Gemini key in client bundle.
- Restrict draft read: only creator owner or admin roles.

## Setup Guide (Google Vision API + Gemini API)
1. Prepare GCP project
- Create/select one GCP project dedicated for this app.
- Ensure billing is enabled.
- Enable APIs:
  - Vision API
  - Gemini API (or Vertex AI API if using Vertex-based Gemini)
  - Cloud Run Functions API / Cloud Functions API
  - Secret Manager API

2. Create server execution identity
- Create a service account for backend AI extraction.
- Grant minimum roles:
  - `roles/visionai.user`
  - `roles/secretmanager.secretAccessor`
  - Firestore access role used by your backend runtime
  - Storage access role for reading uploaded invoice images
- Bind this service account to your function/service runtime.

3. Configure secrets
- Store secrets in Secret Manager:
  - `GEMINI_API_KEY` (if using Gemini API key)
  - Optional provider-specific settings (model name, region)
- Do not place secrets in client `.env`.
- Access secrets only from backend runtime.

4. Choose Gemini access mode
- **Option A (recommended): Vertex AI Gemini**
  - Use service account auth only (no API key in code).
  - Better IAM control for production.
- **Option B: Gemini API key**
  - Use key from Secret Manager.
  - Keep strict server-side usage only.

5. Firebase/Backend runtime wiring
- Keep frontend upload and PB UI in `stockmate` app.
- Add backend endpoint `POST /ai/invoice/extract` in Cloud Functions/Cloud Run.
- Endpoint flow:
  - Verify Firebase Auth token and owner role.
  - Download invoice image from Storage.
  - Run Vision OCR.
  - Send OCR result to Gemini to normalize into strict JSON.
  - Run product mapping and save `ai_invoice_drafts/{draftId}`.

6. Firebase project setup
- Ensure Firestore and Storage are enabled in the same Firebase project.
- Create Storage path convention for invoices, for example:
  - `invoice-uploads/{uid}/{timestamp}-{filename}`
- Add Firestore security rules so only allowed owner users can read their drafts.

7. Local development setup
- Use Application Default Credentials for local backend testing.
- Keep local secrets in backend-only environment file or secret injection flow.
- Never expose runtime secrets to Vite frontend variables.

8. Deployment checklist
- Deploy backend with service account attached.
- Confirm required APIs are enabled in the target project.
- Confirm Secret Manager access works in runtime logs.
- Smoke test:
  - upload invoice photo
  - call extract endpoint
  - verify `ai_invoice_drafts` document created
  - open PB form with `aiDraftId` and editable rows.

## Mapping Strategy (Accuracy-First, aligned with PB UX)
1. Exact match (auto-map)
- SKU/barcode exact match or exact normalized name match.
- Set `selectedProductId` directly.

2. Alias match (auto-map)
- Use `product_aliases` by normalized alias and optional supplier context.

3. Fuzzy match (suggest only)
- Compute top candidates; do not hard-assign on uncertain score.
- Fill `productNameInput` with OCR text so user can quickly search/edit.

4. No confident match
- Keep row unmapped and editable.
- Existing `PoRowEditor` already supports product search and inline new product creation.

## Accuracy Guardrails
- Auto-map only when confidence is high and winner is unique.
- Never auto-save PB from AI result.
- User always reviews and confirms through existing `SIMPAN PB` flow.
- User correction can optionally create alias for next invoice.

## Rollout (safe with current code)
1. Phase 1
- Implement Vision OCR + Gemini normalization + hydrate header/rows into `poDraft`.
- No auto-map confidence UI yet.

2. Phase 2
- Add confidence badges + candidate quick-pick.

3. Phase 3
- Add alias learning from user corrections.

4. Phase 4
- Supplier-specific extraction hints/templates.

## Verification Checklist (directly tied to `StockAdd.tsx`)
- PB tab can start invoice import and return to same page context.
- Imported data fills `poDraft` fields without breaking existing save handler.
- Imported rows remain editable in `PoRowEditor`.
- Existing validation (`poHeaderErrors`, `poRowErrors`, `poFormError`) still works unchanged.
- Duplicate receipt code and idempotency protections remain enforced by existing save transaction.
- Owner-only access is enforced for AI extraction endpoint.
