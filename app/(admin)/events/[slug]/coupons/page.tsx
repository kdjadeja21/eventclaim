import CouponsClient from "./coupons-client";

type Props = { params: Promise<{ slug: string }> };

// Coupons are fetched client-side from /api/events/[slug]/coupons and cached in
// localStorage, so the page keeps working (from the last successful load) even
// when Firestore is unavailable or its quota is exhausted.
export default async function CouponsPage({ params }: Props) {
  const { slug } = await params;
  return <CouponsClient slug={slug} />;
}
