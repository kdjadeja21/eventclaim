/**
 * Central registry of localStorage cache keys used by resilient read views.
 * All keys share a common prefix so they can be cleared together on logout.
 */

export const CACHE_PREFIX = "eventclaim_cache_v1";

export const cacheKeys = {
  dashboard: `${CACHE_PREFIX}:dashboard`,
  events: `${CACHE_PREFIX}:events`,
  audit: `${CACHE_PREFIX}:audit`,
  event: (slug: string) => `${CACHE_PREFIX}:event:${slug}`,
  coupons: (slug: string) => `${CACHE_PREFIX}:coupons:${slug}`,
  coupon: (slug: string, couponId: string) =>
    `${CACHE_PREFIX}:coupon:${slug}:${couponId}`,
  attendees: (slug: string) => `${CACHE_PREFIX}:attendees:${slug}`,
} as const;
