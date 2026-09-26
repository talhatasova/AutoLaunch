import { z } from "zod";
import { companyProfileSchema } from "@directorylaunch/shared";

/**
 * The request body for `POST /api/apps`.
 *
 * Note what is NOT here: `name`, `tagline`, `description`, `logo_url`. Those are
 * scraped from the site, not accepted from the client - the point of the product
 * is that a founder pastes one URL. Optional overrides exist because a scrape
 * can produce a bad title, but the URL is the only required field.
 *
 * `contact_email` is deliberately absent too. It is the authenticated founder's
 * own address, taken from their session. Accepting it from the body would let a
 * caller put someone else's address on a submission made in their name.
 */
export const createAppRequestSchema = z.object({
  url: z.string().trim().min(1, "Paste the address of your site.").max(2048),

  /** Overrides for a scrape that got it wrong. All optional. */
  name: z.string().trim().min(1).max(120).optional(),
  tagline: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(5000).optional(),

  /**
   * Directory slugs whose terms the founder explicitly agreed to in the UI.
   *
   * We never tick a consent checkbox on someone's behalf. A consent-gated
   * directory missing from this list stays `needs_manual` rather than being
   * submitted - see `planFanout`.
   */
  consented_directory_slugs: z.array(z.string().min(1)).max(100).default([]),

  /**
   * The optional company-profile step. Null until the founder fills it in; we
   * do not guess a headcount or a competitor list on someone's behalf, because
   * these get published under their name.
   */
  company_profile: companyProfileSchema.nullable().default(null),
});

export type CreateAppRequest = z.infer<typeof createAppRequestSchema>;
