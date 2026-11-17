import { PrivacyNoticePage } from '@gefinc/ui-shared';
import { appRoutes } from './app.routes';

describe('appRoutes (mobile)', () => {
  it('o aviso de privacidade é público: rota /privacidade fora da casca autenticada', () => {
    const route = appRoutes.find((r) => r.path === 'privacidade');

    expect(route?.component).toBe(PrivacyNoticePage);
    expect(route?.canActivate).toBeUndefined();
  });
});
