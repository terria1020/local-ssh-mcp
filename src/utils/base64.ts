/**
 * Base64 인코딩/디코딩 유틸리티
 */

/**
 * 문자열을 Base64로 인코딩
 */
export function encodeBase64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

/**
 * Base64를 문자열로 디코딩
 */
export function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

/**
 * Base64 문자열이 유효한지 확인
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;

  try {
    return Buffer.from(str, 'base64').toString('base64') === str;
  } catch {
    return false;
  }
}
