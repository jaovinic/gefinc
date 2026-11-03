import { Page } from '@playwright/test';

export interface NativeConfig {
  /** `defaultResult`: o que a biometria responde quando a fila `results` está vazia (padrão 'ok'). */
  biometric?: { available?: boolean; reason?: string; results?: string[]; defaultResult?: string };
  notifications?: { permission?: 'granted' | 'denied' | 'prompt' };
}

/**
 * Troca os plugins nativos (biometria, notificações, barras do sistema, botão Voltar) por dublês no navegador. O app só
 * os aceita em build de desenvolvimento. O estado fica em `window.__gefincNative` e é relido a cada carga
 * da página.
 */
export async function installNativeDoubles(page: Page, config: NativeConfig = {}) {
  await page.addInitScript((cfg) => {
    const w = window as unknown as { __gefincNative: Record<string, unknown> };
    w.__gefincNative = {
      biometric: { available: cfg.biometric?.available ?? true, reason: cfg.biometric?.reason, results: [...(cfg.biometric?.results ?? [])], defaultResult: cfg.biometric?.defaultResult },
      notifications: { permission: cfg.notifications?.permission ?? 'granted', scheduled: [], tapListeners: [] },
      systemBars: [],
      back: { listeners: [], minimized: 0 },
    };
  }, config);
}

/** Estilos de barras de sistema pedidos ao plugin, na ordem ('Dark' = ícones claros; 'Light' = ícones escuros). */
export const systemBarStyles = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gefincNative: { systemBars: string[] } }).__gefincNative.systemBars);

/** Simula o botão Voltar do Android (tecla ou gesto de borda). */
export async function pressAndroidBack(page: Page, canGoBack = true) {
  await page.evaluate((can) => {
    const back = (window as unknown as { __gefincNative: { back: { listeners: ((e: { canGoBack: boolean }) => void)[] } } }).__gefincNative.back;
    back.listeners.forEach((listener) => listener({ canGoBack: can }));
  }, canGoBack);
}

/** Quantas vezes o app foi mandado para o segundo plano pelo Voltar na raiz. */
export const minimizedCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gefincNative: { back: { minimized: number } } }).__gefincNative.back.minimized);

/** Resultados que a biometria dará nas próximas confirmações ('ok', 'failed', 'cancelled', 'lockout', 'unavailable'). */
export async function queueBiometric(page: Page, ...results: string[]) {
  await page.evaluate((list) => {
    (window as unknown as { __gefincNative: { biometric: { results: string[] } } }).__gefincNative.biometric.results.push(...list);
  }, results);
}

export async function setBiometricAvailable(page: Page, available: boolean) {
  await page.evaluate((value) => {
    (window as unknown as { __gefincNative: { biometric: { available: boolean } } }).__gefincNative.biometric.available = value;
  }, available);
}

/** Manda o app para o segundo plano (o Capacitor reage à visibilidade da página no navegador). */
export async function goToBackground(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

export async function returnToForeground(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
