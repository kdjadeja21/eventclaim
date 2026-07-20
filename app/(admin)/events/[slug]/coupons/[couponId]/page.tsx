import CouponDetailClient from "./coupon-detail-client";

type Props = { params: Promise<{ slug: string; couponId: string }> };

// Coupon detail data is fetched client-side from
// /api/events/[slug]/coupons/[couponId] and cached in localStorage, so the page
// keeps working (from the last successful load) even when Firestore is
// unavailable or its quota is exhausted.
export default async function CouponDetailPage({ params }: Props) {
  const { slug, couponId } = await params;
  return <CouponDetailClient slug={slug} couponId={couponId} />;
}
