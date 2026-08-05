"use client";

// Client-only encrypted local storage for app settings (Luma API key, EmailJS
// config). Values are never sent to a server for storage — they're encrypted
// with a per-browser AES-GCM key and kept exclusively in localStorage.
//
// Security note: the encryption key itself is also stored in localStorage
// (there's no login-time passphrase to derive it from). This protects the
// settings from being read as plain text — e.g. in a localStorage dump/backup,
// a casual look at the DevTools Application tab, or an accidental
// screenshot/log — but it is not a substitute for a real secret vault: any
// script able to run in the page (XSS) could still decrypt it. That's an
// acceptable, standard trade-off for a zero-friction local vault that doesn't
// require re-entering a passphrase every session.

import { AppSettings, DEFAULT_SETTINGS } from "./settings";

const KEY_STORAGE_KEY = "eventclaim_settings_dek";
const DATA_STORAGE_KEY = "eventclaim_settings_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.crypto !== "undefined";
}

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getOrCreateKey(): Promise<CryptoKey> {
  let raw = localStorage.getItem(KEY_STORAGE_KEY);
  if (!raw) {
    const keyBytes = window.crypto.getRandomValues(new Uint8Array(32));
    raw = bufToBase64(keyBytes);
    localStorage.setItem(KEY_STORAGE_KEY, raw);
  }
  const keyBytes = base64ToBuf(raw);
  return window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJson(value: unknown): Promise<string> {
  const key = await getOrCreateKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );
  return `${bufToBase64(iv)}.${bufToBase64(ciphertext)}`;
}

async function decryptJson<T>(stored: string): Promise<T | null> {
  const [ivPart, ciphertextPart] = stored.split(".");
  if (!ivPart || !ciphertextPart) return null;
  try {
    const key = await getOrCreateKey();
    const iv = base64ToBuf(ivPart);
    const ciphertext = base64ToBuf(ciphertextPart);
    const plaintext = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

/** Reads and decrypts settings from localStorage, falling back to defaults. */
export async function loadSettings(): Promise<AppSettings> {
  if (!isBrowser()) return DEFAULT_SETTINGS;
  const raw = localStorage.getItem(DATA_STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  const decrypted = await decryptJson<Partial<AppSettings>>(raw);
  if (!decrypted) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...decrypted };
}

/** Encrypts and persists settings to localStorage only. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!isBrowser()) return;
  const encrypted = await encryptJson(settings);
  localStorage.setItem(DATA_STORAGE_KEY, encrypted);
}

/** Removes all locally stored settings (and the encryption key). */
export function clearSettings(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(DATA_STORAGE_KEY);
  localStorage.removeItem(KEY_STORAGE_KEY);
}
