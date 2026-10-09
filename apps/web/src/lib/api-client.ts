import { createClient } from "@/lib/supabase/browser";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Browser -> FastAPI with the user's bearer token. RLS/anon key only. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await createClient().auth.getSession();
  if (!data.session) throw new ApiError("Your session expired. Sign in again.", 401);
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (typeof body.detail?.message === "string") message = body.detail.message;
      else if (typeof body.message === "string") message = body.message;
    } catch {
      /* keep generic message */
    }
    throw new ApiError(message, response.status);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
