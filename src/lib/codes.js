import { randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_LENGTH = 7;
const CUSTOM_CODE = /^[A-Za-z0-9_-]{3,32}$/;
const RESERVED = new Set(['api', 'health']);

export function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function validateCustomCode(code) {
  if (typeof code !== 'string' || !CUSTOM_CODE.test(code)) {
    return 'code must be 3-32 characters using letters, numbers, _ or -';
  }
  if (RESERVED.has(code.toLowerCase())) {
    return 'code is reserved';
  }
  return null;
}
