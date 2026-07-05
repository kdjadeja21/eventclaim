// Server-only. Never import from client components.

export type LumaApprovalStatus =
  | "approved"
  | "session"
  | "pending_approval"
  | "invited"
  | "declined"
  | "waitlist";

export type LumaSortColumn =
  | "name"
  | "email"
  | "created_at"
  | "registered_at"
  | "checked_in_at";

export type LumaSortDirection =
  | "asc"
  | "desc"
  | "asc nulls last"
  | "desc nulls last";

export interface LumaRegistrationAnswer {
  label: string;
  question_id: string;
  value: unknown;
  question_type: string;
  answer?: string;
  answer_company?: string;
  answer_job_title?: string;
}

export interface LumaEventTicket {
  id: string;
  amount: number;
  amount_discount: number;
  amount_tax: number;
  currency: string | null;
  checked_in_at: string | null;
  event_ticket_type_id: string;
  is_captured: boolean;
  name: string;
}

export interface LumaGuest {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  approval_status: LumaApprovalStatus;
  registered_at: string | null;
  checked_in_at: string | null;
  phone_number?: string | null;
  registration_answers?: LumaRegistrationAnswer[];
  event_tickets?: LumaEventTicket[];
}

interface LumaGetGuestsResponse {
  entries: LumaGuest[];
  has_more: boolean;
  next_cursor?: string;
}

export interface FetchAllGuestsParams {
  event_id: string;
  approval_status?: LumaApprovalStatus;
  sort_column?: LumaSortColumn;
  sort_direction?: LumaSortDirection;
}

export interface FetchLumaGuestsPageParams extends FetchAllGuestsParams {
  pagination_cursor?: string;
  pagination_limit?: number;
}

export interface FetchLumaGuestsPageResult {
  entries: LumaGuest[];
  has_more: boolean;
  next_cursor?: string;
}

const LUMA_API_BASE = "https://public-api.luma.com";
const MAX_PAGES = 200; // safety cap: 200 × 50 = 10 000 guests max
const DEFAULT_PAGE_SIZE = 50;

export function isLumaApiConfigured(): boolean {
  if (process.env.USE_DEV_DATA === "true") return true;
  return Boolean(process.env.LUMA_API_KEY?.trim());
}

export async function fetchLumaGuestsPage(
  params: FetchLumaGuestsPageParams
): Promise<FetchLumaGuestsPageResult> {
  if (process.env.USE_DEV_DATA === "true") {
    const { getDevLumaGuestsPage } = await import("@/lib/dev-store");
    const page = getDevLumaGuestsPage({
      cursor: params.pagination_cursor,
      limit: params.pagination_limit ?? DEFAULT_PAGE_SIZE,
    });
    return {
      entries: page.entries,
      has_more: page.has_more,
      next_cursor: page.next_cursor,
    };
  }

  const apiKey = process.env.LUMA_API_KEY?.trim();
  if (!apiKey) throw new Error("LUMA_API_KEY is not set in environment.");

  const limit = params.pagination_limit ?? DEFAULT_PAGE_SIZE;
  const qs = new URLSearchParams({
    event_id: params.event_id,
    pagination_limit: String(limit),
  });
  if (params.approval_status) qs.set("approval_status", params.approval_status);
  if (params.sort_column) qs.set("sort_column", params.sort_column);
  if (params.sort_direction) qs.set("sort_direction", params.sort_direction);
  if (params.pagination_cursor) qs.set("pagination_cursor", params.pagination_cursor);

  const res = await fetch(`${LUMA_API_BASE}/v1/event/get-guests?${qs.toString()}`, {
    headers: { "x-luma-api-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Luma API error ${res.status}: ${body}`);
  }

  const data: LumaGetGuestsResponse = await res.json();
  return {
    entries: data.entries,
    has_more: data.has_more,
    next_cursor: data.next_cursor,
  };
}

export async function fetchAllLumaGuests(
  params: FetchAllGuestsParams
): Promise<LumaGuest[]> {
  const all: LumaGuest[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchLumaGuestsPage({
      ...params,
      pagination_cursor: cursor,
    });
    all.push(...data.entries);

    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return all;
}
