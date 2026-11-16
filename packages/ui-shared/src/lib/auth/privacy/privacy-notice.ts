import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthCard } from '../auth-card';

/**
 * Aviso de privacidade (rota pública `/privacidade`): o que a sessão guarda (IP e tipo de dispositivo e
 * de navegador), para quê, por quanto tempo e como é apagado. Texto mínimo, sujeito à revisão do dono do
 * produto antes da publicação (FR-061, R7).
 */
@Component({
  selector: 'gef-privacy-notice',
  imports: [AuthCard, RouterLink],
  template: `
    <gef-auth-card heading="Privacidade">
      <div class="space-y-5 text-body-base" data-testid="privacy-notice">
        <section class="space-y-2" aria-labelledby="privacy-what">
          <h2 id="privacy-what" class="text-title-sm font-semibold">O que guardamos</h2>
          <p>
            Cada vez que você entra, a sessão guarda o endereço IP e o tipo de dispositivo e de navegador usados
            (por exemplo, "Chrome em Windows"). Por isso não guardamos o texto completo que o navegador envia,
            só esse rótulo resumido.
          </p>
        </section>

        <section class="space-y-2" aria-labelledby="privacy-why">
          <h2 id="privacy-why" class="text-title-sm font-semibold">Para quê</h2>
          <p>
            Para a segurança da sua conta: reconhecer acessos incomuns e permitir que a administração encerre uma
            sessão suspeita. Esses dados não são usados para publicidade nem compartilhados.
          </p>
        </section>

        <section class="space-y-2" aria-labelledby="privacy-how-long">
          <h2 id="privacy-how-long" class="text-title-sm font-semibold">Por quanto tempo</h2>
          <p>
            Os dados da sessão ficam enquanto ela estiver aberta e por mais 30 dias depois de encerrada ou
            expirada. Registros de acesso de visitantes (quem não tem conta) são guardados por até 90 dias.
          </p>
          <p>
            O IP de tentativas de acesso negadas feitas por quem tem conta fica enquanto a conta existir e é
            apagado junto com a conta, quando você a exclui. A limpeza de 90 dias só atinge visitantes.
          </p>
        </section>

        <section class="space-y-2" aria-labelledby="privacy-erase">
          <h2 id="privacy-erase" class="text-title-sm font-semibold">Como são apagados</h2>
          <p>
            Quando você exclui a conta, o IP e o dispositivo ligados a você são apagados. Os dados de visitantes
            são apagados automaticamente depois de 90 dias.
          </p>
        </section>

        <a class="gef-btn-secondary block w-full text-center" routerLink="/login">Voltar para o login</a>
      </div>
    </gef-auth-card>
  `,
})
export class PrivacyNoticePage {}
