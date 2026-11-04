import { environment as dev } from './environment';
import { environment as prod } from './environment.prod';

describe('environment', () => {
  it('aponta para a API local em desenvolvimento e testes', () => {
    // Acoplado a APP_API em apps/mobile-app-e2e/src/support.ts, que intercepta as chamadas do app.
    expect(dev.apiUrl).toBe('http://localhost:8080/api/v1');
  });

  it('aponta para a API publica por https em producao', () => {
    expect(prod.apiUrl.startsWith('https://')).toBe(true);
    expect(prod.apiUrl.endsWith('/api/v1')).toBe(true);
    expect(prod.apiUrl).not.toContain('localhost');
    expect(prod.apiUrl).not.toContain('10.0.2.2');
  });
});
