import { passwordViolation } from './password-policy';

describe('passwordViolation', () => {
  it('aceita 10 caracteres ou mais', () => {
    expect(passwordViolation('1234567890')).toBeNull();
    expect(passwordViolation('uma frase longa e segura')).toBeNull();
  });

  it('recusa senha curta, vazia ou só com espaços', () => {
    expect(passwordViolation('123456789')).toContain('pelo menos 10');
    expect(passwordViolation('')).toContain('pelo menos 10');
    expect(passwordViolation(null)).toContain('pelo menos 10');
    expect(passwordViolation('          ')).toContain('pelo menos 10');
  });

  it('limita em 72 bytes UTF-8, não em 72 caracteres', () => {
    expect(passwordViolation('a'.repeat(72))).toBeNull();
    expect(passwordViolation('a'.repeat(73))).toContain('72 bytes');
    expect(passwordViolation('ç'.repeat(36))).toBeNull();
    expect(passwordViolation('ç'.repeat(37))).toContain('72 bytes');
  });
});
