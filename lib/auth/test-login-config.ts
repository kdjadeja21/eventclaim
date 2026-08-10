/** Dedicated Firebase UID for the sandbox test-login user.
 * Events created under this UID are isolated from every other admin. */
export const TEST_LOGIN_UID = "eventclaim-test-login";

const TRUTHY = new Set(["true", "1", "yes"]);

export function isTestLoginEnabled(): boolean {
  return TRUTHY.has((process.env.ENABLE_TEST_LOGIN ?? "").toLowerCase());
}

export function getTestLoginUser() {
  return {
    uid: TEST_LOGIN_UID,
    email: process.env.TEST_LOGIN_EMAIL?.trim() || "dev@test.local",
  };
}

export function isTestLoginUid(uid: string): boolean {
  return uid === TEST_LOGIN_UID;
}
