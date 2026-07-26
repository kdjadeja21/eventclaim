"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  isEmailConfigured,
  isLumaConfigured,
  toEmailConfig,
  type EmailConfig,
} from "./settings";
import { loadSettings, saveSettings, clearSettings } from "./client-settings";

type AppSettingsContextValue = {
  settings: AppSettings;
  loading: boolean;
  lumaConfigured: boolean;
  emailConfigured: boolean;
  emailConfig: EmailConfig;
  updateSettings: (next: AppSettings) => Promise<void>;
  resetSettings: () => void;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadSettings().then((loaded) => {
      if (mounted) {
        setSettings(loaded);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const updateSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  const resetSettings = useCallback(() => {
    clearSettings();
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      settings,
      loading,
      lumaConfigured: isLumaConfigured(settings),
      emailConfigured: isEmailConfigured(settings),
      emailConfig: toEmailConfig(settings),
      updateSettings,
      resetSettings,
    }),
    [settings, loading, updateSettings, resetSettings]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error("useAppSettings must be used within an AppSettingsProvider");
  }
  return ctx;
}
