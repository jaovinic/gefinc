import { environment as dev } from './environment';
import { environment as prod } from './environment.prod';

describe('environment', () => {
  it('usa o caminho relativo da API em desenvolvimento e testes', () => {
    expect(dev.apiUrl).toBe('/api/v1');
  });

  it('aponta para a API publica por https em producao', () => {
    expect(prod.apiUrl.startsWith('https://')).toBe(true);
    expect(prod.apiUrl.endsWith('/api/v1')).toBe(true);
    expect(prod.apiUrl).not.toContain('localhost');
  });
});
