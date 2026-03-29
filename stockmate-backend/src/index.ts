import vision from '@google-cloud/vision';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const visionClient = new vision.ImageAnnotatorClient();
const db = getFirestore();
const auth = getAuth();
const storage = getStorage();

interface InvoiceExtractBody {
  imagePath?: string;
  supplierHint?: string;
}

interface ParsedInvoiceItem {
  rawName: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
}

interface ParsedInvoiceResult {
  supplierName: string;
  receiptCode: string;
  receiptDate: string;
  note: string;
  items: ParsedInvoiceItem[];
}

interface ProductRecord {
  id: string;
  name: string;
  sku: string;
  isActive: boolean;
}

interface Candidate {
  productId: string;
  productName: string;
  score: number;
}

type MatchStatus = 'high_confidence' | 'review_needed' | 'manual_required';

interface MappedInvoiceRow {
  rawName: string;
  mappedProductId: string | null;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  confidence: number;
  status: MatchStatus;
  candidates: Candidate[];
}

const normalizeText = (value: string): string =>
  value
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toUpper = (value: string): string => value.toLocaleUpperCase('id-ID').trim();

const toDateInput = (value: string): string => {
  const direct = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const slash = direct.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!slash) return new Date().toISOString().slice(0, 10);
  const dd = slash[1].padStart(2, '0');
  const mm = slash[2].padStart(2, '0');
  const yyRaw = slash[3];
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  return `${yyyy}-${mm}-${dd}`;
};

const extractReceiptCodeFallback = (ocrText: string): string => {
  const patterns = [
    /\bS\/CI-[A-Z0-9/-]+\b/i,
    /\bINV(?:OICE)?[#: ]+([A-Z0-9/-]{5,})\b/i,
    /\bNO(?:\.|MOR)?\s*INVOICE[#: ]+([A-Z0-9/-]{5,})\b/i,
  ];
  for (const pattern of patterns) {
    const match = ocrText.match(pattern);
    if (!match) continue;
    const value = match[1] || match[0];
    if (value) return toUpper(value);
  }
  return '';
};

const extractDateFallback = (ocrText: string): string => {
  const dateMatch = ocrText.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  return dateMatch ? toDateInput(dateMatch[1]) : new Date().toISOString().slice(0, 10);
};

const extractSupplierFallback = (ocrText: string): string => {
  const lines = ocrText.split('\n').map((line) => line.trim()).filter(Boolean);
  const stopWords = ['INVOICE', 'SALES INVOICE', 'BILL TO', 'CUSTOMER', 'NO INVOICE', 'DATE'];
  for (const line of lines.slice(0, 12)) {
    const upper = line.toLocaleUpperCase('id-ID');
    if (upper.length < 4) continue;
    if (stopWords.some((word) => upper.includes(word))) continue;
    if (!/[A-Z]/.test(upper)) continue;
    return toUpper(upper);
  }
  return '';
};

const safeJsonParse = <T>(text: string): T => {
  const cleaned = text
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
};

const jaccardScore = (a: string, b: string): number => {
  const aSet = new Set(a.split(' ').filter(Boolean));
  const bSet = new Set(b.split(' ').filter(Boolean));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
};

const findMatches = (rawName: string, products: ProductRecord[]): { mappedProductId: string | null; confidence: number; status: MatchStatus; candidates: Candidate[] } => {
  const needle = normalizeText(rawName);
  if (!needle) {
    return { mappedProductId: null, confidence: 0, status: 'manual_required', candidates: [] };
  }

  const activeProducts = products.filter((item) => item.isActive);
  for (const product of activeProducts) {
    if (normalizeText(product.sku) && normalizeText(product.sku) === needle) {
      return {
        mappedProductId: product.id,
        confidence: 1,
        status: 'high_confidence',
        candidates: [{ productId: product.id, productName: product.name, score: 1 }],
      };
    }
  }

  for (const product of activeProducts) {
    if (normalizeText(product.name) === needle) {
      return {
        mappedProductId: product.id,
        confidence: 0.98,
        status: 'high_confidence',
        candidates: [{ productId: product.id, productName: product.name, score: 0.98 }],
      };
    }
  }

  const scored = activeProducts
    .map((product) => {
      const nameNorm = normalizeText(product.name);
      const includesScore = nameNorm.includes(needle) || needle.includes(nameNorm) ? 0.15 : 0;
      const tokenScore = jaccardScore(needle, nameNorm);
      const score = Math.min(0.92, tokenScore * 0.85 + includesScore);
      return {
        productId: product.id,
        productName: product.name,
        score: Number(score.toFixed(4)),
      };
    })
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const top = scored[0];
  if (!top) {
    return { mappedProductId: null, confidence: 0, status: 'manual_required', candidates: [] };
  }
  if (top.score >= 0.93) {
    return {
      mappedProductId: top.productId,
      confidence: top.score,
      status: 'high_confidence',
      candidates: scored,
    };
  }
  if (top.score >= 0.75) {
    return {
      mappedProductId: top.productId,
      confidence: top.score,
      status: 'review_needed',
      candidates: scored,
    };
  }
  return {
    mappedProductId: null,
    confidence: top.score,
    status: 'manual_required',
    candidates: scored,
  };
};

const extractJsonWithGemini = async (ocrText: string, apiKey: string, supplierHint = ''): Promise<ParsedInvoiceResult> => {
  const prompt = [
    'You are extracting supplier invoice data for inventory stock-in.',
    'Return strict JSON only with this exact shape:',
    '{"supplierName":"","receiptCode":"","receiptDate":"","note":"","items":[{"rawName":"","qty":0,"buyPrice":0,"sellPrice":0}]}',
    'Rules:',
    '- qty, buyPrice, sellPrice must be numbers',
    '- If sellPrice is missing, set it equal to buyPrice',
    '- receiptDate must be YYYY-MM-DD when possible',
    '- Use uppercase supplier and receipt text when possible',
    '- Invoice may be rotated, noisy, skewed, or partially cropped',
    '- Common columns: QTY/JUMLAH BARANG, HARGA BARANG/NETTO, DISKON, SUBTOTAL',
    '- Map unit strings PCS/Pcs/UNIT as quantity count only',
    '- Ignore summary rows such as TOTAL, SUBTOTAL, DISCOUNT, PPN, ONGKIR, DPP',
    '- Do not output rows for payment/bank/shipping/note sections',
    '- Keep rawName concise but specific to product name only',
    `Supplier hint: ${supplierHint || '-'}`,
    'OCR TEXT:',
    ocrText.slice(0, 24000),
  ].join('\n');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${message}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((item) => item.text || '').join('\n').trim() || '';
  if (!text) throw new Error('Gemini returned empty response');
  const parsed = safeJsonParse<ParsedInvoiceResult>(text);
  const fallbackSupplierName = extractSupplierFallback(ocrText);
  const fallbackReceiptCode = extractReceiptCodeFallback(ocrText);
  const fallbackReceiptDate = extractDateFallback(ocrText);
  return {
    supplierName: toUpper(parsed.supplierName || fallbackSupplierName),
    receiptCode: toUpper(parsed.receiptCode || fallbackReceiptCode),
    receiptDate: toDateInput(parsed.receiptDate || fallbackReceiptDate),
    note: String(parsed.note || '').trim(),
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
        rawName: toUpper(String(item.rawName || '').trim()),
        qty: Number(item.qty || 0),
        buyPrice: Number(item.buyPrice || 0),
        sellPrice: Number(item.sellPrice || item.buyPrice || 0),
      }))
      : [],
  };
};

const getUserRole = async (uid: string, phoneNumber?: string): Promise<string | null> => {
  if (phoneNumber) {
    const byPhone = await db.collection('users').doc(phoneNumber).get();
    if (byPhone.exists) {
      const role = byPhone.get('role');
      return typeof role === 'string' ? role : null;
    }
  }
  const byUid = await db.collection('users').where('uid', '==', uid).limit(1).get();
  if (byUid.empty) return null;
  const role = byUid.docs[0].get('role');
  return typeof role === 'string' ? role : null;
};

const readProducts = async (): Promise<ProductRecord[]> => {
  const snapshot = await db.collection('products').limit(5000).get();
  return snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
    id: doc.id,
    name: String(doc.get('name') || ''),
    sku: String(doc.get('sku') || ''),
    isActive: doc.get('isActive') !== false,
  }));
};

const sendJson = (res: { status: (code: number) => { json: (body: Record<string, unknown>) => void } }, status: number, payload: Record<string, unknown>) => {
  res.status(status).json(payload);
};

export const invoiceExtract = onRequest(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [GEMINI_API_KEY],
  },
  async (req, res): Promise<void> => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) {
        sendJson(res, 401, { error: 'Missing bearer token' });
        return;
      }

      const decoded = await auth.verifyIdToken(token);
      const role = await getUserRole(decoded.uid, decoded.phone_number);
      if (role !== 'owner') {
        sendJson(res, 403, { error: 'Owner role required' });
        return;
      }

      const body = (req.body || {}) as InvoiceExtractBody;
      const imagePath = String(body.imagePath || '').trim();
      if (!imagePath) {
        sendJson(res, 400, { error: 'imagePath is required' });
        return;
      }
      if (imagePath.includes('..')) {
        sendJson(res, 400, { error: 'Invalid imagePath' });
        return;
      }

      const bucket = storage.bucket();
      const [buffer] = await bucket.file(imagePath).download();
      const [visionResult] = await visionClient.documentTextDetection({
        image: { content: buffer },
      });
      const ocrText = visionResult.fullTextAnnotation?.text || visionResult.textAnnotations?.[0]?.description || '';
      if (!ocrText.trim()) {
        sendJson(res, 422, { error: 'OCR text is empty' });
        return;
      }

      const geminiApiKey = GEMINI_API_KEY.value();
      if (!geminiApiKey) {
        sendJson(res, 500, { error: 'Missing GEMINI_API_KEY secret' });
        return;
      }

      const parsed = await extractJsonWithGemini(ocrText, geminiApiKey, body.supplierHint);
      const products = await readProducts();

      const mappedRows: MappedInvoiceRow[] = parsed.items
        .filter((item) => item.rawName && item.qty > 0 && item.buyPrice > 0)
        .map((item) => {
          const match = findMatches(item.rawName, products);
          return {
            rawName: item.rawName,
            mappedProductId: match.mappedProductId,
            qty: item.qty,
            buyPrice: item.buyPrice,
            sellPrice: item.sellPrice > 0 ? item.sellPrice : item.buyPrice,
            confidence: match.confidence,
            status: match.status,
            candidates: match.candidates,
          };
        });

      const overallConfidence = mappedRows.length > 0
        ? mappedRows.reduce((sum, row) => sum + row.confidence, 0) / mappedRows.length
        : 0;

      const draftRef = db.collection('ai_invoice_drafts').doc();
      await draftRef.set({
        createdBy: decoded.uid,
        status: 'ready',
        supplierName: parsed.supplierName,
        receiptCode: parsed.receiptCode,
        receiptDate: parsed.receiptDate,
        note: parsed.note,
        imagePath,
        rows: mappedRows,
        overallConfidence: Number(overallConfidence.toFixed(4)),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      sendJson(res, 200, {
        draftId: draftRef.id,
        draft: {
          supplierName: parsed.supplierName,
          receiptCode: parsed.receiptCode,
          receiptDate: parsed.receiptDate,
          note: parsed.note,
          rows: mappedRows,
          overallConfidence: Number(overallConfidence.toFixed(4)),
        },
      });
    } catch (error) {
      logger.error('invoiceExtract failed', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendJson(res, 500, { error: 'invoice_extract_failed', message });
    }
  },
);
