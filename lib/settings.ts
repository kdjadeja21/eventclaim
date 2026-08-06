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

/** Field-level validation messages. Empty string means the value is acceptable. */
export type SettingsFieldErrors = Partial<
  Record<
    | "lumaApiKey"
    | "emailjsServiceId"
    | "emailjsTemplateId"
    | "emailjsPublicKey"
    | "emailjsPrivateKey"
    | "emailjsMonthlyQuota"
    | "emailjsMonthlyUsedBaseline"
    | "appBaseUrl",
    string
  >
>;

const LUMA_KEY_RE = /^secret-[A-Za-z0-9_-]{8,}$/;
const EMAILJS_SERVICE_RE = /^service_[A-Za-z0-9_-]{4,}$/;
const EMAILJS_TEMPLATE_RE = /^template_[A-Za-z0-9_-]{4,}$/;
const EMAILJS_PUBLIC_RE = /^(user_)?[A-Za-z0-9_-]{8,}$/;
const EMAILJS_PRIVATE_RE = /^[A-Za-z0-9_-]{16,}$/;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates settings draft for the Settings form.
 * Empty Luma / EmailJS credential groups are allowed (not configured yet).
 * If any EmailJS credential is filled, all four must be present and format-valid.
 */
export function validateSettings(draft: AppSettings): SettingsFieldErrors {
  const errors: SettingsFieldErrors = {};

  const luma = draft.lumaApiKey.trim();
  if (luma && !LUMA_KEY_RE.test(luma)) {
    errors.lumaApiKey =
      "Luma API key must start with secret- and include at least 8 more characters.";
  }

  const serviceId = draft.emailjsServiceId.trim();
  const templateId = draft.emailjsTemplateId.trim();
  const publicKey = draft.emailjsPublicKey.trim();
  const privateKey = draft.emailjsPrivateKey.trim();
  const anyEmailjs =
    Boolean(serviceId) ||
    Boolean(templateId) ||
    Boolean(publicKey) ||
    Boolean(privateKey);

  if (anyEmailjs) {
    if (!serviceId) {
      errors.emailjsServiceId = "Service ID is required when configuring EmailJS.";
    } else if (!EMAILJS_SERVICE_RE.test(serviceId)) {
      errors.emailjsServiceId =
        "Service ID must look like service_xxxxxxx.";
    }

    if (!templateId) {
      errors.emailjsTemplateId =
        "Template ID is required when configuring EmailJS.";
    } else if (!EMAILJS_TEMPLATE_RE.test(templateId)) {
      errors.emailjsTemplateId =
        "Template ID must look like template_xxxxxxx.";
    }

    if (!publicKey) {
      errors.emailjsPublicKey =
        "Public key is required when configuring EmailJS.";
    } else if (!EMAILJS_PUBLIC_RE.test(publicKey)) {
      errors.emailjsPublicKey =
        "Public key should be at least 8 characters (often starts with user_).";
    }

    if (!privateKey) {
      errors.emailjsPrivateKey =
        "Private key is required when configuring EmailJS.";
    } else if (!EMAILJS_PRIVATE_RE.test(privateKey)) {
      errors.emailjsPrivateKey =
        "Private key should be at least 16 letters, numbers, _ or -.";
    }
  }

  const quota = Number(draft.emailjsMonthlyQuota);
  if (!Number.isFinite(quota) || !Number.isInteger(quota) || quota < 1) {
    errors.emailjsMonthlyQuota = "Monthly quota must be a whole number of at least 1.";
  }

  const baseline = Number(draft.emailjsMonthlyUsedBaseline);
  if (!Number.isFinite(baseline) || !Number.isInteger(baseline) || baseline < 0) {
    errors.emailjsMonthlyUsedBaseline =
      "Used baseline must be a whole number of 0 or more.";
  } else if (Number.isFinite(quota) && baseline > quota) {
    errors.emailjsMonthlyUsedBaseline =
      "Used baseline cannot be greater than the monthly quota.";
  }

  const baseUrl = draft.appBaseUrl.trim();
  if (baseUrl && !isValidHttpUrl(baseUrl)) {
    errors.appBaseUrl = "App base URL must be a valid http:// or https:// address.";
  }

  return errors;
}

export function isSettingsDraftValid(draft: AppSettings): boolean {
  return Object.keys(validateSettings(draft)).length === 0;
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
