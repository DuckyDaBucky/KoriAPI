import {
  createCipheriv,
  createHash,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOpaqueToken(size = 32): string {
  return randomBytes(size).toString("base64url");
}

export function safeTokenCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptString(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decryptString(payload: string, secret: string): string {
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const derived = scryptSync(password, salt, 64).toString("base64url");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64).toString("base64url");
  return safeTokenCompare(derived, hash);
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateBase32Secret(length = 32): string {
  let result = "";
  const random = randomBytes(length);
  for (const value of random) {
    result += base32Alphabet[value % base32Alphabet.length];
  }
  return result;
}

function base32ToBuffer(value: string): Buffer {
  let bits = "";
  for (const character of value.replace(/=+$/g, "").toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index === -1) {
      throw new Error("INVALID_BASE32_SECRET");
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let position = 0; position + 8 <= bits.length; position += 8) {
    bytes.push(Number.parseInt(bits.slice(position, position + 8), 2));
  }

  return Buffer.from(bytes);
}

function generateTotp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32ToBuffer(secret)).update(counter).digest();
  const lastByte = hmac.at(-1);
  if (lastByte === undefined) {
    throw new Error("INVALID_TOTP_STATE");
  }
  const offset = lastByte & 0x0f;
  const slice = hmac.subarray(offset, offset + 4);
  if (slice.length < 4) {
    throw new Error("INVALID_TOTP_OFFSET");
  }
  const [a, b, c, d] = slice as unknown as [number, number, number, number];
  const code =
    ((a & 0x7f) << 24) |
    ((b & 0xff) << 16) |
    ((c & 0xff) << 8) |
    (d & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

export function buildTotpOtpAuthUrl(input: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = `${input.issuer}:${input.accountName}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function verifyTotpCode(secret: string, code: string, window = 1): boolean {
  const sanitized = code.replace(/\s+/g, "");
  const step = Math.floor(Date.now() / 30_000);
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeTokenCompare(generateTotp(secret, step + offset), sanitized)) {
      return true;
    }
  }
  return false;
}

export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry)) as T;
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|authorization|refresh|content/i.test(key)) {
        output[key] = "[redacted]";
      } else {
        output[key] = redactSensitive(entry);
      }
    }
    return output as T;
  }

  return value;
}
