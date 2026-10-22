import { Component } from '@angular/core';
import { EmptyView } from '@gefinc/ui-shared';

/** Página inicial provisória da área autenticada; o painel do mês (US6) a substitui. */
@Component({
  selector: 'gef-home',
  imports: [EmptyView],
  template: `
    <gef-empty
      title="Tudo pronto para começar"
      hint="Suas contas, lançamentos e o painel do mês aparecerão aqui à medida que você os cadastrar."
    />
  `,
})
export class Home {}
