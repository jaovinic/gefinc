import { Component } from '@angular/core';
import { PrivacyNoticePage } from '@gefinc/ui-shared';

/** Aviso de privacidade em uma tela rolável (como as telas de acesso); carregado sob demanda. */
@Component({
  selector: 'gef-privacy-page',
  imports: [PrivacyNoticePage],
  template: '<div class="gef-screen"><gef-privacy-notice /></div>',
})
export class PrivacyPage {}
