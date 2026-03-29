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

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === 'string' ? data.message : `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!data?.draftId) {
    throw new Error('Respons AI draft tidak valid.');
  }

  return data as InvoiceExtractResponse;
};
