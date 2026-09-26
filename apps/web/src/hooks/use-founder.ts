"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * The signed-in founder's own identity, for display in the submit flow.
 *
 * This exists because the payload we send carries a real person's name and
 * email, and they are entitled to see which ones before anything leaves. It is
 * read from the session with the anon key; RLS and the auth server are what
 * make it true, and nothing here is ever used for authorization.
 *
 * `name` is null when Google gave us nothing. We render that as "not on file"
 * rather than inventing a persona - the same rule that governs contact_email.
 */
export interface Founder {
  name: string | null;
  email: string | null;
}

export type FounderState =
  | { status: "loading"; founder: null }
  | { status: "anonymous"; founder: null }
  | { status: "signed_in"; founder: Founder };

export function useFounder(): FounderState {
  const [state, setState] = useState<FounderState>({ status: "loading", founder: null });

  useEffect(() => {
    let alive = true;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!alive) return;
        const user = data.user;
        if (!user) {
          setState({ status: "anonymous", founder: null });
          return;
        }
        const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
        const raw = metadata.full_name ?? metadata.name;
        const name = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
        setState({ status: "signed_in", founder: { name, email: user.email ?? null } });
      })
      .catch(() => {
        // A failed identity read is not an error state for the page. The user
        // is simply treated as signed out, and the API rejects the launch with
        // a 401 they can act on.
        if (alive) setState({ status: "anonymous", founder: null });
      });

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
