import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';
import { formatNumber } from '../utils/format';

const OWNER_NOTIFICATION_PERMISSION_KEY = 'owner-staff-notification-permission-requested';
const MAX_NOTIFICATIONS = 20;

const toMillis = (value: unknown) => {
  if (!value || typeof value !== 'object') return 0;
  const maybeTimestamp = value as { toMillis?: () => number };
  if (typeof maybeTimestamp.toMillis === 'function') {
    return maybeTimestamp.toMillis();
  }
  return 0;
};

interface SaleData {
  total?: number;
  paymentMethod?: string;
  soldBy?: string;
  soldAt?: unknown;
}

interface StockMovementData {
  type?: string;
  quantityChange?: number;
  performedBy?: string;
  performedAt?: unknown;
  productId?: string;
  note?: string;
}

interface CachedActor {
  name: string;
  role: UserProfile['role'] | 'unknown';
}

export interface OwnerNotificationItem {
  id: string;
  title: string;
  body: string;
  createdAtMillis: number;
}

interface UseOwnerSaleNotificationsResult {
  notifications: OwnerNotificationItem[];
  unreadCount: number;
  markAllAsRead: () => void;
}

const toMovementLabel = (type: string) => {
  if (type === 'stock_in') return 'Stok Masuk';
  if (type === 'adjustment') return 'Penyesuaian Stok';
  return 'Aktivitas Stok';
};

const toMovementBody = (staffName: string, movementData: StockMovementData, productName: string) => {
  const qty = Number(movementData.quantityChange || 0);
  const qtyLabel = `${qty > 0 ? '+' : ''}${formatNumber(qty)}`;
  const namePart = productName ? ` · ${productName}` : '';
  const notePart = movementData.note ? ` · ${movementData.note}` : '';
  return `${staffName} mencatat ${qtyLabel}${namePart}${notePart}`;
};

export function useOwnerSaleNotifications(currentUserUid?: string, userProfile?: UserProfile | null): UseOwnerSaleNotificationsResult {
  const actorCacheRef = useRef<Record<string, CachedActor>>({});
  const productNameCacheRef = useRef<Record<string, string>>({});
  const [notifications, setNotifications] = useState<OwnerNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const canNotifyInBrowser = useMemo(
    () => typeof window !== 'undefined' && 'Notification' in window,
    [],
  );

  useEffect(() => {
    if (userProfile?.role !== 'owner') return;
    if (!canNotifyInBrowser) return;

    const alreadyRequested = localStorage.getItem(OWNER_NOTIFICATION_PERMISSION_KEY) === 'true';

    if (Notification.permission === 'default' && !alreadyRequested) {
      localStorage.setItem(OWNER_NOTIFICATION_PERMISSION_KEY, 'true');
      void Notification.requestPermission();
    }
  }, [canNotifyInBrowser, userProfile?.role]);

  const showBrowserNotification = useCallback(async (item: OwnerNotificationItem) => {
    if (!canNotifyInBrowser) return;
    if (Notification.permission !== 'granted') return;

    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(item.title, {
        body: item.body,
        tag: item.id,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
      });
      return;
    }

    const notification = new Notification(item.title, {
      body: item.body,
      tag: item.id,
      icon: '/pwa-192x192.png',
    });

    notification.onclick = () => {
      window.focus();
    };
  }, [canNotifyInBrowser]);

  useEffect(() => {
    if (userProfile?.role !== 'owner' || !currentUserUid) return;
    if (!canNotifyInBrowser) return;

    let initializedSales = false;
    let initializedMovements = false;
    let newestKnownSaleMillis = Date.now();
    let newestKnownMovementMillis = Date.now();
    const seenNotificationIds = new Set<string>();

    const pushNotification = async (item: OwnerNotificationItem) => {
      if (seenNotificationIds.has(item.id)) return;
      seenNotificationIds.add(item.id);
      setNotifications((prev) => [item, ...prev].slice(0, MAX_NOTIFICATIONS));
      setUnreadCount((prev) => prev + 1);
      await showBrowserNotification(item);
    };

    const getActorProfile = async (uid: string): Promise<CachedActor> => {
      if (actorCacheRef.current[uid]) {
        return actorCacheRef.current[uid];
      }

      const usersByUidQuery = query(
        collection(db, 'users'),
        where('uid', '==', uid),
        limit(1)
      );

      const snap = await getDocs(usersByUidQuery);
      if (snap.empty) {
        return { name: 'Staf', role: 'unknown' };
      }

      const profile = snap.docs[0].data() as UserProfile;
      const actor = {
        name: profile.name?.trim() || 'Staf',
        role: profile.role || 'unknown',
      };
      actorCacheRef.current[uid] = actor;
      return actor;
    };

    const getProductName = async (productId: string) => {
      if (!productId) return '';
      if (productNameCacheRef.current[productId]) {
        return productNameCacheRef.current[productId];
      }

      const productSnap = await getDoc(doc(db, 'products', productId));
      if (!productSnap.exists()) return '';

      const name = String(productSnap.data().name || '').trim();
      productNameCacheRef.current[productId] = name;
      return name;
    };

    const salesQuery = query(collection(db, 'sales'), orderBy('soldAt', 'desc'), limit(25));
    const movementsQuery = query(collection(db, 'stock_movements'), orderBy('performedAt', 'desc'), limit(40));

    const unsubscribeSales = onSnapshot(salesQuery, async (snapshot) => {
      if (!initializedSales) {
        const latestSnapshotMillis = snapshot.docs.reduce((latest, docSnap) => {
          const data = docSnap.data() as SaleData;
          const soldAtMillis = toMillis(data.soldAt);
          return Math.max(latest, soldAtMillis);
        }, newestKnownSaleMillis);

        newestKnownSaleMillis = latestSnapshotMillis;
        initializedSales = true;
        return;
      }

      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;

        const saleData = change.doc.data() as SaleData;
        if (!saleData.soldBy || saleData.soldBy === currentUserUid) continue;

        const actor = await getActorProfile(saleData.soldBy);
        if (actor.role !== 'staff') continue;

        const soldAtMillis = toMillis(saleData.soldAt);
        if (soldAtMillis <= newestKnownSaleMillis) continue;

        newestKnownSaleMillis = Math.max(newestKnownSaleMillis, soldAtMillis);

        try {
          await pushNotification({
            id: `sale-${change.doc.id}`,
            title: 'Penjualan Baru',
            body: `${actor.name} mencatat penjualan Rp ${formatNumber(saleData.total || 0)} (${saleData.paymentMethod || 'Metode tidak diketahui'})`,
            createdAtMillis: soldAtMillis || Date.now(),
          });
        } catch (error) {
          console.error('Failed to show owner sale notification:', error);
        }
      }
    });

    const unsubscribeMovements = onSnapshot(movementsQuery, async (snapshot) => {
      if (!initializedMovements) {
        const latestSnapshotMillis = snapshot.docs.reduce((latest, docSnap) => {
          const data = docSnap.data() as StockMovementData;
          const performedAtMillis = toMillis(data.performedAt);
          return Math.max(latest, performedAtMillis);
        }, newestKnownMovementMillis);
        newestKnownMovementMillis = latestSnapshotMillis;
        initializedMovements = true;
        return;
      }

      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;

        const movementData = change.doc.data() as StockMovementData;
        if (movementData.type === 'sale') continue;
        if (!movementData.performedBy || movementData.performedBy === currentUserUid) continue;

        const actor = await getActorProfile(movementData.performedBy);
        if (actor.role !== 'staff') continue;

        const performedAtMillis = toMillis(movementData.performedAt);
        if (performedAtMillis <= newestKnownMovementMillis) continue;
        newestKnownMovementMillis = Math.max(newestKnownMovementMillis, performedAtMillis);

        try {
          const productName = movementData.productId ? await getProductName(movementData.productId) : '';
          await pushNotification({
            id: `movement-${change.doc.id}`,
            title: toMovementLabel(String(movementData.type || '')),
            body: toMovementBody(actor.name, movementData, productName),
            createdAtMillis: performedAtMillis || Date.now(),
          });
        } catch (error) {
          console.error('Failed to show owner staff-action notification:', error);
        }
      }
    });

    return () => {
      unsubscribeSales();
      unsubscribeMovements();
    };
  }, [canNotifyInBrowser, currentUserUid, showBrowserNotification, userProfile?.role]);

  const markAllAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    markAllAsRead,
  };
}
