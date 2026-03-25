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
  createdAt?: Date | any; // allow Firestore Timestamp
  updatedAt?: Date | any;
}

export interface Sale {
  id?: string;
  items: SaleItem[];
  total: number;
  paymentMethod: string;
  soldBy: string; // User ID
  soldAt: Date | any;
}

export interface SaleItem {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number; // To track if it was negotiated
  costPrice: number; // To calculate profit later
}

export interface UserProfile {
  uid: string;
  phoneNumber: string;
  role: 'owner' | 'staff';
  name?: string;
  createdAt?: Date | any;
}
