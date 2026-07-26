// Shared settings types — safe to import from both client and server code.
// Values themselves are never read from process.env; they live only in the
// admin's browser (see lib/client-settings.ts) and are passed explicitly into
// server actions that need them.

export interface AppSettings {
  lumaApiKey: string;
  emailjsServiceId: string;
  emailjsTemplateId: string;
  emailjsPublicKey: string;
  emailjsPrivateKey: string;
  emailjsMonthlyQuota: number;
  emailjsMonthlyUsedBaseline: number;
  appBaseUrl: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  lumaApiKey: "",
  emailjsServiceId: "",
  emailjsTemplateId: "",
  emailjsPublicKey: "",
  emailjsPrivateKey: "",
  emailjsMonthlyQuota: 200,
  emailjsMonthlyUsedBaseline: 0,
  appBaseUrl: "",
};

export interface EmailConfig {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  monthlyQuota: number;
  monthlyUsedBaseline: number;
  appBaseUrl: string;
}

export function isLumaConfigured(settings: AppSettings): boolean {
  return Boolean(settings.lumaApiKey.trim());
}

export function isEmailConfigured(settings: AppSettings): boolean {
  return Boolean(
    settings.emailjsServiceId.trim() &&
      settings.emailjsTemplateId.trim() &&
      settings.emailjsPublicKey.trim() &&
      settings.emailjsPrivateKey.trim()
  );
}

/**
 * Builds the EmailConfig object expected by lib/email.ts from AppSettings.
 * Only ever called from client code (lib/use-app-settings.tsx), so it's safe
 * to fall back to the browser's current origin when no base URL was set.
 */
export function toEmailConfig(settings: AppSettings): EmailConfig {
  const appBaseUrl =
    settings.appBaseUrl.trim() ||
    (typeof window !== "undefined" ? window.location.origin : "");

  return {
    serviceId: settings.emailjsServiceId.trim(),
    templateId: settings.emailjsTemplateId.trim(),
    publicKey: settings.emailjsPublicKey.trim(),
    privateKey: settings.emailjsPrivateKey.trim(),
    monthlyQuota: Math.max(0, Number(settings.emailjsMonthlyQuota) || 0),
    monthlyUsedBaseline: Math.max(
      0,
      Number(settings.emailjsMonthlyUsedBaseline) || 0
    ),
    appBaseUrl,
  };
}
