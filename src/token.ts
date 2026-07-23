// Podepsané pozvánkové tokeny (HMAC-SHA256). Token nese scope + role;
// při přijetí se z něj založí user + membership. (Vzor převzat z projektu aukce.)
// Formát:  base64url(payloadJSON) "." base64url(hmac)

export interface InvitePayload {
  /** E-mail, na který pozvánka míří (v přijímacím formuláři zamčený). */
  email: string;
  /** Rozsah přiznaného přístupu. */
  scope_type: "company" | "project" | "issue";
  scope_id: string;
  /** Přidělené role (CSV). */
  roles: string;
  /** Expirace (unix sekundy). */
  exp: number;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signInvite(payload: InvitePayload, secret: string): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Vrátí payload, nebo null když je token neplatný / prošlý. Konstantní čas (crypto.subtle.verify). */
export async function verifyInvite(
  token: string,
  secret: string,
  nowSec: number,
): Promise<InvitePayload | null> {
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload: InvitePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < nowSec) return null;
  if (!payload.email || !payload.scope_id) return null;
  return payload;
}
