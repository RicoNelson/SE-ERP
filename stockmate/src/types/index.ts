import type { Timestamp } from 'firebase/firestore';

type FirestoreDate = Date | Timestamp;

export interface Product {
  id?: string;
  name: string;
  sku: string;
  category?: string;
  sellPrice: number;
  costPrice: number; // Harga Modal
  stockQty: number;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt?: FirestoreDate;
  updatedAt?: FirestoreDate;
}

export interface Sale {
  id?: string;
  items: SaleItem[];
  total: number;
  paymentMethod: string;
  soldBy: string; // User ID
  soldAt: FirestoreDate;
}

export interface SaleItem {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number; // To track if it was negotiated
  costPrice: number; // To calculate profit later
}

export interface OperatingExpense {
  id?: string;
  amount: number;
  category: string;
  note?: string;
  spentAt: FirestoreDate;
  createdBy: string;
  createdAt?: FirestoreDate;
}

export interface UserProfile {
  uid: string;
  phoneNumber: string;
  role: 'owner' | 'staff';
  name?: string;
  createdAt?: FirestoreDate;
}
