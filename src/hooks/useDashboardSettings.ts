/**
 * useDashboardSettings
 *
 * Persists dashboard-wide user preferences in localStorage so they survive
 * page reloads. Currently manages:
 *   - allowDrag: whether widgets can be dragged/repositioned on view dashboards
 *               (default: false — dashboards are read-only by default)
 *
 * All hook instances in the same browser tab stay in sync via a custom window
 * event (SETTINGS_CHANGED_EVENT). When Settings.tsx toggles a value, Home.tsx
 * and GeneralHome.tsx immediately re-render with the updated setting without
 * needing a shared Context or full-app refactor.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'anedya:dashboard:settings';
const SETTINGS_CHANGED_EVENT = 'anedya:dashboard:settings-changed';

interface DashboardSettings {
  allowDrag: boolean;
}

const DEFAULTS: DashboardSettings = {
  allowDrag: false,
};

function readStorage(): DashboardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeStorage(settings: DashboardSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore (private browsing / storage full)
  }
}

export function useDashboardSettings() {
  const [settings, setSettings] = useState<DashboardSettings>(readStorage);

  // Listen for changes broadcast by any other hook instance in the same tab
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<DashboardSettings>).detail;
      setSettings(next);
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handler);
  }, []);

  const update = useCallback((patch: Partial<DashboardSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeStorage(next);
      // Notify all other hook instances mounted in this tab
      window.dispatchEvent(
        new CustomEvent<DashboardSettings>(SETTINGS_CHANGED_EVENT, { detail: next })
      );
      return next;
    });
  }, []);

  return { settings, update };
}
