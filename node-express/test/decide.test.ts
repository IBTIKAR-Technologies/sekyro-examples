// decide(): one branch for every status and every not_verified reason.
import { describe, expect, it } from "vitest";
import { decide } from "../src/decide.js";

describe("decide", () => {
  it.each([
    [{ status: "verified" }, "document_biometric", { access: true, show: "verified", canRetry: false }],
    [{ status: "verified" }, "contact_email", { access: false, show: "needs_stronger_proof", canRetry: false }],
    [{ status: "review_pending" }, null, { access: false, show: "in_review", canRetry: false }],
    [{ status: "created" }, null, { access: false, show: "continue", canRetry: false }],
    [{ status: "in_progress" }, null, { access: false, show: "continue", canRetry: false }],
    [{ status: "not_verified", reason: "not_opened", closedBy: "expiry" }, null, { access: false, show: "expired", canRetry: true }],
    [{ status: "not_verified", reason: "abandoned", closedBy: "expiry" }, null, { access: false, show: "expired", canRetry: true }],
    [{ status: "not_verified", reason: "rejected", closedBy: "automatic" }, null, { access: false, show: "rejected", canRetry: false }],
    [{ status: "not_verified", reason: "inconclusive", closedBy: "automatic" }, null, { access: false, show: "try_again", canRetry: true }],
    [{ status: "not_verified", reason: "unavailable", closedBy: "automatic" }, null, { access: false, show: "try_later", canRetry: true }],
    [{ status: "not_verified", reason: "policy", closedBy: "automatic" }, null, { access: false, show: "policy", canRetry: false }],
    [{ status: "not_verified", reason: "cancelled", closedBy: "organization" }, null, { access: false, show: "cancelled", canRetry: false }],
    [{ status: "not_verified", reason: "superseded", closedBy: "automatic", supersededBy: "ses_newer" }, null, { access: false, show: "follow_newer", canRetry: false, next: "ses_newer" }],
  ] as const)("%j -> %j", (session, assurance, expected) => {
    expect(decide(session as Parameters<typeof decide>[0], assurance as Parameters<typeof decide>[1])).toEqual(expected);
  });
});
