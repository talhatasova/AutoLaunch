import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM in the shared contract format `v1:<b64 iv 12B>:<b64 ciphertext+tag>`.
 * The API (Python) writes the same format, so either side can read the other.
 */
export function encryptionKey(raw = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  const key = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be base64 of exactly 32 bytes");
  return key;
}

export function encrypt(plain: string, key = encryptionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `v1:${iv.toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(token: string, key = encryptionKey()): string {
  const [version, ivB64, dataB64] = token.split(":");
  if (version !== "v1" || !ivB64 || !dataB64) throw new Error("Unsupported ciphertext format");
  const data = Buffer.from(dataB64, "base64");
  if (data.length < 16) throw new Error("Ciphertext is truncated");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
}
