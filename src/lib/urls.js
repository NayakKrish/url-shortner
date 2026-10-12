const MAX_URL_LENGTH = 2048;
const MAX_EXPIRES_IN = 60 * 60 * 24 * 365 * 10;

export function validateUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return 'url must be an http or https URL up to 2048 characters';
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return 'url must be an http or https URL up to 2048 characters';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'url must use http or https';
  }

  return null;
}

export function validateExpiresIn(value) {
  if (value === undefined) return { expiresAt: null };

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > MAX_EXPIRES_IN) {
    return { error: 'expiresIn must be a positive integer number of seconds' };
  }

  return { expiresAt: Date.now() + value * 1000 };
}
