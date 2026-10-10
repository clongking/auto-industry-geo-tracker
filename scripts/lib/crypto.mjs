/**
 * 共享加密工具：PBKDF2-SHA256 + AES-256-GCM
 */
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
export const SALT_HEX = 'ba6e17bf43354ec48964324aaeac3031';
export const PBKDF2_ITERATIONS = 600_000;

export const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((b) => parseInt(b, 16)));
export const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');
export const fromBase64 = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

export async function deriveKey(password, salt = hexToBytes(SALT_HEX)) {
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  );
}

export async function encrypt(plaintext, password) {
  const key = await deriveKey(password);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
    salt: SALT_HEX,
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function decrypt({ iv, data, salt, iterations }, password) {
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: hexToBytes(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(data));
  return new TextDecoder().decode(plain);
}
