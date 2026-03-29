export interface InvoiceExtractRequest {
  idToken: string;
  imagePath: string;
  supplierHint?: string;
}

export interface InvoiceExtractRowCandidate {
  productId: string;
  productName: string;
  score: number;
}

export interface InvoiceExtractDraftRow {
  rawName: string;
  mappedProductId: string | null;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  confidence: number;
  status: 'high_confidence' | 'review_needed' | 'manual_required';
  candidates: InvoiceExtractRowCandidate[];
}

export interface InvoiceExtractDraft {
  supplierName: string;
  receiptCode: string;
  receiptDate: string;
  note: string;
  rows: InvoiceExtractDraftRow[];
  overallConfidence: number;
}

export interface InvoiceExtractResponse {
  draftId: string;
  draft: InvoiceExtractDraft;
}

interface InvoiceExtractErrorResponse {
  error?: string;
  message?: string;
  limit?: number;
  retryAfterSeconds?: number;
}

const INVOICE_EXTRACT_URL = import.meta.env.VITE_INVOICE_EXTRACT_URL as string | undefined;

export const extractInvoiceDraft = async (payload: InvoiceExtractRequest): Promise<InvoiceExtractResponse> => {
  if (!INVOICE_EXTRACT_URL) {
    throw new Error('VITE_INVOICE_EXTRACT_URL belum diatur.');
  }
  const response = await fetch(INVOICE_EXTRACT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payload.idToken}`,
    },
    body: JSON.stringify({
      imagePath: payload.imagePath,
      supplierHint: payload.supplierHint || '',
    }),
  });

  const data = await response.json().catch(() => ({})) as InvoiceExtractErrorResponse | InvoiceExtractResponse;
  if (!response.ok) {
    if ((data as InvoiceExtractErrorResponse).error === 'invoice_extract_monthly_limit') {
      const limit = (data as InvoiceExtractErrorResponse).limit || 250;
      throw new Error(`Batas extract invoice bulanan sudah tercapai (${limit}x).`);
    }
    if ((data as InvoiceExtractErrorResponse).error === 'gemini_quota_exceeded') {
      const retryAfterSeconds = (data as InvoiceExtractErrorResponse).retryAfterSeconds || 30;
      throw new Error(`Kuota Gemini sedang habis. Coba lagi dalam ${retryAfterSeconds} detik.`);
    }
    const message = typeof (data as InvoiceExtractErrorResponse).message === 'string' ? (data as InvoiceExtractErrorResponse).message : `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!(data as InvoiceExtractResponse)?.draftId) {
    throw new Error('Respons AI draft tidak valid.');
  }

  return data as InvoiceExtractResponse;
};
