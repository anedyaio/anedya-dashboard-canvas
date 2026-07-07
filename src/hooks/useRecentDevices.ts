import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "anedya_recent_devices";
const MAX_RECENT = 5;

export interface RecentDevice {
  id: string;
  title: string;
  path: string;
  accessedAt: number; // timestamp
}

function readFromStorage(): RecentDevice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentDevice[];
  } catch {
    return [];
  }
}

function writeToStorage(devices: RecentDevice[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
  } catch {
    // ignore quota errors
  }
}

/**
 * Manages the list of recently accessed devices.
 * Pure localStorage – no API calls. Instant reads, no loading state.
 */
export function useRecentDevices() {
  const [recentDevices, setRecentDevices] = useState<RecentDevice[]>(() =>
    readFromStorage()
  );

  // Sync state if another tab updates storage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setRecentDevices(readFromStorage());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  /**
   * Call this whenever the user navigates to a device page.
   * Deduplicates, moves to top, and caps at MAX_RECENT.
   */
  const addRecentDevice = useCallback(
    (device: Omit<RecentDevice, "accessedAt">) => {
      setRecentDevices((prev) => {
        // Remove existing entry with same id (deduplicate)
        const filtered = prev.filter((d) => d.id !== device.id);
        // Prepend the new entry
        const updated: RecentDevice[] = [
          { ...device, accessedAt: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT);
        writeToStorage(updated);
        return updated;
      });
    },
    []
  );

  /**
   * Remove a single device from recents by ID (e.g. after deletion).
   */
  const removeRecentDevice = useCallback((id: string) => {
    setRecentDevices((prev) => {
      const updated = prev.filter((d) => d.id !== id);
      writeToStorage(updated);
      return updated;
    });
  }, []);

  /**
   * Remove a single device from recents by path (e.g. when DevicePage
   * confirms the slug no longer exists in the database).
   */
  const removeRecentDeviceByPath = useCallback((path: string) => {
    setRecentDevices((prev) => {
      const updated = prev.filter((d) => d.path !== path);
      writeToStorage(updated);
      return updated;
    });
  }, []);

  /**
   * Wipe all recent history.
   */
  const clearRecentDevices = useCallback(() => {
    setRecentDevices([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    recentDevices,
    addRecentDevice,
    removeRecentDevice,
    removeRecentDeviceByPath,
    clearRecentDevices,
  };
}
