export const SESSION_COOKIE_NAME = "beautycontent_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  sub: string;
  email: string;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return null;
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

export async function signSessionToken(input: { userId: string; email: string }): Promise<string> {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }

  const payload: SessionPayload = {
    sub: input.userId,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const encodedPayload = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret, "sign");
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload),
  );

  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  const secret = getAuthSecret();
  if (!secret) return null;

  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex !== token.lastIndexOf(".")) {
    return null;
  }

  const encodedPayload = token.slice(0, dotIndex);
  const encodedSignature = token.slice(dotIndex + 1);
  const payloadBytes = fromBase64Url(encodedPayload);
  const signatureBytes = fromBase64Url(encodedSignature);
  if (!payloadBytes || !signatureBytes) {
    return null;
  }

  const key = await importHmacKey(secret, "verify");
  const valid = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signatureBytes),
    encoder.encode(encodedPayload),
  );
  if (!valid) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object"
    || parsed === null
    || typeof (parsed as Record<string, unknown>).sub !== "string"
    || typeof (parsed as Record<string, unknown>).email !== "string"
    || typeof (parsed as Record<string, unknown>).exp !== "number"
  ) {
    return null;
  }

  const payload = parsed as SessionPayload;
  if (!payload.sub || !payload.email || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
