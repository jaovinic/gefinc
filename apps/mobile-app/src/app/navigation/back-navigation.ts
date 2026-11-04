import { Location } from '@angular/common';
import { EnvironmentProviders, Injectable, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { closeTopSheet } from '@gefinc/ui-shared';
import { AppLockService } from '../lock/app-lock.service';
import { BACK_BUTTON_PORT } from '../native/native-ports';

/** Telas onde o Voltar não tem para onde ir: o app é mandado para o segundo plano. */
const ROOT_PATHS = ['/', '/login'];

/**
 * Botão Voltar do Android (tecla e gesto de borda). Ao registrar um ouvinte, o Capacitor deixa de voltar o
 * WebView sozinho, então este serviço decide tudo, nesta ordem: tela de bloqueio ignora; painel aberto
 * fecha; fora da raiz volta na navegação (ou vai ao painel, sem histórico); na raiz minimiza o app.
 */
@Injectable({ providedIn: 'root' })
export class BackNavigation {
  private readonly port = inject(BACK_BUTTON_PORT);
  private readonly lock = inject(AppLockService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  start(): Promise<void> {
    return this.port.onBack(({ canGoBack }) => {
      // O ouvinte nativo não espera a promessa: uma falha (ex.: minimizar rejeitado) não pode virar rejeição não tratada.
      this.handle(canGoBack).catch(() => undefined);
    });
  }

  async handle(canGoBack: boolean): Promise<void> {
    // A tela de bloqueio não pode ser contornada pelo Voltar (o app fica inerte atrás dela).
    if (this.lock.locked()) {
      return;
    }
    if (closeTopSheet()) {
      return;
    }
    const path = this.router.url.split(/[?#]/)[0];
    if (ROOT_PATHS.includes(path)) {
      // `minimizeApp`, não `exitApp`: sair encerraria o processo e perderia a sessão e o estado.
      await this.port.minimize();
    } else if (canGoBack) {
      this.location.back();
    } else {
      await this.router.navigateByUrl('/', { replaceUrl: true });
    }
  }
}

/** Liga o tratamento do botão Voltar na inicialização; sem o plugin (navegador) nada acontece. */
export function provideBackNavigation(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const back = inject(BackNavigation);
    try {
      await back.start();
    } catch {
      // Sem o plugin: o Voltar do navegador segue o comportamento padrão.
    }
  });
}
