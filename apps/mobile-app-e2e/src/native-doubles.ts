import { Page } from '@playwright/test';

export interface NativeConfig {
  /** `defaultResult`: o que a biometria responde quando a fila `results` está vazia (padrão 'ok'). */
  biometric?: { available?: boolean; reason?: string; results?: string[]; defaultResult?: string };
  notifications?: { permission?: 'granted' | 'denied' | 'prompt' };
}

/**
 * Troca os plugins nativos (biometria, proteção de tela, notificações) por dublês no navegador. O app só
 * os aceita em build de desenvolvimento. O estado fica em `window.__gefincNative` e é relido a cada carga
 * da página.
 */
export async function installNativeDoubles(page: Page, config: NativeConfig = {}) {
  await page.addInitScript((cfg) => {
    const w = window as unknown as { __gefincNative: Record<string, unknown> };
    const state = w.__gefincNative as { privacyOn?: boolean } | undefined;
    w.__gefincNative = {
      biometric: { available: cfg.biometric?.available ?? true, reason: cfg.biometric?.reason, results: [...(cfg.biometric?.results ?? [])], defaultResult: cfg.biometric?.defaultResult },
      privacy: {
        enable: () => ((w.__gefincNative as { privacyOn?: boolean }).privacyOn = true),
        disable: () => ((w.__gefincNative as { privacyOn?: boolean }).privacyOn = false),
      },
      privacyOn: state?.privacyOn ?? false,
      notifications: { permission: cfg.notifications?.permission ?? 'granted', scheduled: [], tapListeners: [] },
    };
  }, config);
}

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

export const privacyIsOn = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gefincNative: { privacyOn: boolean } }).__gefincNative.privacyOn);

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
