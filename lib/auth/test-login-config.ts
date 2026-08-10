const TRUTHY = new Set(["true", "1", "yes"]);

export function isTestLoginEnabled(): boolean {
  return TRUTHY.has((process.env.ENABLE_TEST_LOGIN ?? "").toLowerCase());
}

export function getTestLoginUser() {
  return {
    uid: process.env.TEST_LOGIN_UID ?? "test-dev-admin",
    email: process.env.TEST_LOGIN_EMAIL ?? "dev@test.local",
  };
}
