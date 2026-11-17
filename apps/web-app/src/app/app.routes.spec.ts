import { PrivacyNoticePage } from '@gefinc/ui-shared';
import { appRoutes } from './app.routes';

describe('appRoutes (web)', () => {
  it('o aviso de privacidade é público: rota /privacidade fora da área autenticada', () => {
    const route = appRoutes.find((r) => r.path === 'privacidade');

    expect(route?.component).toBe(PrivacyNoticePage);
    expect(route?.canActivate).toBeUndefined();
  });
});
