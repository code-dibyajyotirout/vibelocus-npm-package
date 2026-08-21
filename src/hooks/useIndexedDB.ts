import { useState, useEffect, useCallback } from "react";
import LZString from "lz-string";

export interface DrawerRecord {
  id?: number;
  wing: string;
  room: string;
  drawer: string;
  compressedContent: string;
  embedding: number[] | null;
  rawSize: number;
  compressedSize: number;
  createdAt: number;
}

export interface DBStats {
  wingsCount: number;
  roomsCount: number;
  drawersCount: number;
  rawTotalBytes: number;
  compressedTotalBytes: number;
  savedPercentage: number;
}

export interface QuotaInfo {
  quota: string;
  usage: string;
  status: "Healthy" | "Moderate" | "Low Space Warning!";
  color: string;
}

const DB_NAME = "VibeLearningDB";
const DB_VERSION = 1;
const STORE_NAME = "drawers";

export function useIndexedDB() {
  const [drawers, setDrawers] = useState<DrawerRecord[]>([]);
  const [stats, setStats] = useState<DBStats>({
    wingsCount: 0,
    roomsCount: 0,
    drawersCount: 0,
    rawTotalBytes: 0,
    compressedTotalBytes: 0,
    savedPercentage: 0,
  });
  const [quota, setQuota] = useState<QuotaInfo>({
    quota: "Calculating...",
    usage: "Calculating...",
    status: "Healthy",
    color: "var(--secondary)",
  });
  const [isReady, setIsReady] = useState(false);

  // Opens IndexedDB connection
  const openDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB is not supported on this platform"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      };
      request.onsuccess = (e) => {
        resolve((e.target as IDBOpenDBRequest).result);
      };
      request.onerror = (e) => {
        reject((e.target as IDBOpenDBRequest).error);
      };
    });
  }, []);

  // Fetch all records
  const getAllDrawers = useCallback(async (): Promise<DrawerRecord[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = (e) => {
        const results = (e.target as IDBRequest<DrawerRecord[]>).result || [];
        setDrawers(results);
        resolve(results);
      };
      request.onerror = (e) => {
        reject((e.target as IDBRequest).error);
      };
    });
  }, [openDB]);

  // Compute metrics and update stats
  const refreshStatsAndQuota = useCallback(async () => {
    try {
      const allDrawers = await getAllDrawers();

      const wings = new Set<string>();
      const rooms = new Set<string>();
      let rawBytes = 0;
      let compBytes = 0;

      allDrawers.forEach((d) => {
        if (d.wing) wings.add(d.wing);
        if (d.wing && d.room) rooms.add(`${d.wing}-${d.room}`);
        rawBytes += d.rawSize || 0;
        compBytes += d.compressedSize || 0;
      });

      const savedPercentage =
        rawBytes > 0 ? Math.round((1 - compBytes / rawBytes) * 100) : 0;

      setStats({
        wingsCount: wings.size,
        roomsCount: rooms.size,
        drawersCount: allDrawers.length,
        rawTotalBytes: rawBytes,
        compressedTotalBytes: compBytes,
        savedPercentage,
      });

      // Storage Quota Estimation
      if (
        typeof window !== "undefined" &&
        navigator.storage &&
        navigator.storage.estimate
      ) {
        const estimate = await navigator.storage.estimate();
        const q = estimate.quota || 0;
        const u = estimate.usage || 0;

        const formatBytes = (bytes: number) => {
          if (bytes === 0) return "0 B";
          const k = 1024;
          const sizes = ["B", "KB", "MB", "GB"];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
        };

        const pct = q > 0 ? (u / q) * 100 : 0;
        let status: "Healthy" | "Moderate" | "Low Space Warning!" = "Healthy";
        let color = "var(--secondary)";

        if (pct > 80) {
          status = "Low Space Warning!";
          color = "var(--danger)";
        } else if (pct > 50) {
          status = "Moderate";
          color = "var(--primary)";
        }

        setQuota({
          quota: formatBytes(q),
          usage: formatBytes(u),
          status,
          color,
        });
      }
    } catch (e) {
      console.error("Failed to load DB stats & quota:", e);
    }
  }, [getAllDrawers]);

  // Insert or update a drawer record
  const addDrawer = useCallback(
    async (record: Omit<DrawerRecord, "id"> & { id?: number }): Promise<boolean> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(record); // put handles both add and update if id is provided
        request.onsuccess = async () => {
          await refreshStatsAndQuota();
          resolve(true);
        };
        request.onerror = (e) => {
          reject((e.target as IDBRequest).error);
        };
      });
    },
    [openDB, refreshStatsAndQuota]
  );

  // Delete a drawer by ID
  const deleteDrawer = useCallback(
    async (id: number): Promise<boolean> => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = async () => {
          await refreshStatsAndQuota();
          resolve(true);
        };
        request.onerror = (e) => {
          reject((e.target as IDBRequest).error);
        };
      });
    },
    [openDB, refreshStatsAndQuota]
  );

  // Purge entire database store
  const clearDB = useCallback(async (): Promise<boolean> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = async () => {
        await refreshStatsAndQuota();
        resolve(true);
      };
      request.onerror = (e) => {
        reject((e.target as IDBRequest).error);
      };
    });
  }, [openDB, refreshStatsAndQuota]);

  // Load database content on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      refreshStatsAndQuota().then(() => {
        setIsReady(true);
      });
    }
  }, [refreshStatsAndQuota]);

  return {
    drawers,
    stats,
    quota,
    isReady,
    addDrawer,
    deleteDrawer,
    clearDB,
    getAllDrawers,
    refreshStats: refreshStatsAndQuota,
    LZString, // Re-expose utilities for convenience
  };
}
