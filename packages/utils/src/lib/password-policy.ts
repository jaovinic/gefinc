/** Mesma política do servidor: mínimo de 10 caracteres e máximo de 72 bytes em UTF-8. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_BYTES = 72;

/** Motivo da recusa em português, ou `null` se a senha é aceita. */
export function passwordViolation(password: string | null | undefined): string | null {
  if (!password || password.trim() === '' || [...password].length < PASSWORD_MIN_LENGTH) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `A senha deve ter no máximo ${PASSWORD_MAX_BYTES} bytes (use menos caracteres especiais).`;
  }
  return null;
}
