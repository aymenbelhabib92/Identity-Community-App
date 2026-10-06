export const DEFAULT_COUNTRY_CODE = '216';

/**
 * Normalises a phone number to E.164. Local Tunisian numbers (8 digits) get the
 * +216 prefix; "00" international prefixes become "+".
 */
export function normalizePhone(input: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  let s = input.trim().replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    if (!/^\d+$/.test(s)) return null;
    s = s.length === 8 ? `+${defaultCountryCode}${s}` : `+${s}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  if (s.startsWith('+216') && s.length !== 12) return null;
  return s;
}

/** "+216 20 123 456" */
export function formatPhone(e164: string): string {
  const tn = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(e164);
  return tn ? `+216 ${tn[1]} ${tn[2]} ${tn[3]}` : e164;
}

function nameParts(fullName: string): string[] {
  return fullName.trim().split(/\s+/).filter(Boolean);
}

export function firstName(fullName: string): string {
  return nameParts(fullName)[0] ?? fullName;
}

/** "Karim Ben Salah" → "Karim B." */
export function shortName(fullName: string): string {
  const [first, second] = nameParts(fullName);
  if (!first) return fullName;
  return second ? `${first} ${second[0]!.toUpperCase()}.` : first;
}

/** A short presentation on the member's profile, as on Instagram. */
export const BIO_MAX_LENGTH = 150;

/**
 * "@karim.cupra", "karim.cupra" or a link to the profile → "karim.cupra";
 * null when it is not an Instagram name.
 */
export function normalizeInstagram(input: string): string | null {
  let handle = input.trim();
  const link = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#\s]+)/i.exec(handle);
  if (link) handle = link[1]!;
  handle = handle.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

export const instagramUrl = (handle: string) => `https://www.instagram.com/${encodeURIComponent(handle)}/`;

/** "Karim Ben Salah" → "KB" */
export function initials(fullName: string): string {
  const [first, second] = nameParts(fullName);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase() || '?';
}
