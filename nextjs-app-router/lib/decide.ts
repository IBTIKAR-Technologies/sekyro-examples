// What your app does with a session: every status and every not_verified reason, decided on the
// server. `show` is a key your page turns into words; `canRetry` says whether to offer a new session.
import type { Session, VerificationAssurance } from "@sekyro/node";

/**
 * The proofs this app accepts for a verified session. Decide on the kind of proof, not on a level
 * number: replace the list with what your use case needs (see the Levels guide). This list accepts
 * Human and Identity proofs; a Contact proof (an email or phone only) is not accepted.
 */
export const ACCEPTED_ASSURANCE: readonly VerificationAssurance[] = [
  "live_only",
  "live_unique",
  "supplied_biometric",
  "document_biometric",
  "eid_authenticated",
  "chip_biometric",
  "registry_biometric",
];

export type Show =
  | "verified"
  | "needs_stronger_proof"
  | "in_review"
  | "continue"
  | "rejected"
  | "try_again"
  | "expired"
  | "try_later"
  | "policy"
  | "cancelled"
  | "follow_newer"
  | "not_verified";

export interface Decision {
  /** Grant what the verification protects. */
  access: boolean;
  show: Show;
  /** Offer the person a new session. */
  canRetry: boolean;
  /** `superseded` only: the newer session that took over. */
  next?: string;
}

export function decide(
  s: Pick<Session, "status" | "reason" | "closedBy" | "supersededBy">,
  assurance: VerificationAssurance | null | undefined,
): Decision {
  switch (s.status) {
    case "verified":
      return assurance && ACCEPTED_ASSURANCE.includes(assurance)
        ? { access: true, show: "verified", canRetry: false }
        : { access: false, show: "needs_stronger_proof", canRetry: false };
    case "review_pending":
      // Not a failure: a reviewer decides, then a session.verified or session.not_verified webhook follows.
      return { access: false, show: "in_review", canRetry: false };
    case "created":
    case "in_progress":
      // Not finished, or a reviewer asked for a new capture: send the person back to the same session.
      return { access: false, show: "continue", canRetry: false };
    case "not_verified":
      // The link expired before a verdict: nobody opened it, or the person left. Offer a new session.
      if (s.closedBy === "expiry" && (s.reason === "not_opened" || s.reason === "abandoned")) {
        return { access: false, show: "expired", canRetry: true };
      }
      switch (s.reason) {
        case "inconclusive":
        case "abandoned":
        case "not_opened":
          return { access: false, show: "try_again", canRetry: true };
        case "unavailable":
          return { access: false, show: "try_later", canRetry: true };
        case "rejected":
          // Never retry automatically, and never loop on a re-check whose face did not match;
          // offer a way to contact you.
          return { access: false, show: "rejected", canRetry: false };
        case "policy":
          return { access: false, show: "policy", canRetry: false };
        case "cancelled":
          return { access: false, show: "cancelled", canRetry: false };
        case "superseded":
          return {
            access: false,
            show: "follow_newer",
            canRetry: false,
            ...(s.supersededBy ? { next: s.supersededBy } : {}),
          };
        default:
          return { access: false, show: "not_verified", canRetry: false };
      }
    default:
      return { access: false, show: "not_verified", canRetry: false };
  }
}
