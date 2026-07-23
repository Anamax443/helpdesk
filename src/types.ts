// Sdílené typy a doménové konstanty.

export interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  TICKET: DurableObjectNamespace;
  ASSETS: Fetcher;
  AI: Ai;
  // VECTORIZE?: VectorizeIndex;   // po vytvoření indexu

  // vars
  PUBLIC_BASE_URL: string;
  AI_PROVIDER: "workers-ai" | "claude" | "off";
  // secrets
  INVITE_SECRET: string;
  ANTHROPIC_API_KEY?: string;
}

// Stavy životního cyklu (jeden stroj; standard i custom služba).
export const STATUS = [
  "new",
  "open",
  "customer_collab",
  "offer_sent",
  "in_progress",
  "waiting_deploy",
  "third_party",
  "on_hold",
  "accepted",
  "closed_invoiced",
  "closed_not_invoiced",
] as const;
export type Status = (typeof STATUS)[number];

// Povolené přechody. Schvalování je NEPOVINNÁ větev:
// interní pokyny jdou open → in_progress přímo; offer_sent se vloží jen když je třeba schválení.
export const TRANSITIONS: Record<Status, Status[]> = {
  new: ["open", "closed_not_invoiced"],
  open: ["customer_collab", "offer_sent", "in_progress", "closed_not_invoiced"],
  customer_collab: ["open", "in_progress"],
  offer_sent: ["in_progress", "closed_not_invoiced"], // Accept → in_progress, Decline → closed
  in_progress: ["waiting_deploy", "third_party", "on_hold", "accepted", "customer_collab"],
  waiting_deploy: ["accepted", "in_progress"],
  third_party: ["in_progress"],
  on_hold: ["in_progress"],
  accepted: ["closed_invoiced"],
  closed_invoiced: [],
  closed_not_invoiced: [],
};

export type Priority = "blocking" | "critical" | "high" | "low";
export type Role = "admin" | "solver" | "pm" | "contact" | "approver" | "watcher";
