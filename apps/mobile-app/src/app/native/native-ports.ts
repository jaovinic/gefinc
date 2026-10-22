import { InjectionToken, isDevMode } from '@angular/core';
import { BiometricAuth, BiometryError } from '@aparajita/capacitor-biometric-auth';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { LocalNotifications } from '@capacitor/local-notifications';

export type BiometricFailureCode = 'cancelled' | 'failed' | 'lockout' | 'unavailable';

/** Por que a biometria não autenticou. */
export class BiometricFailure extends Error {
  constructor(readonly code: BiometricFailureCode) {
    super(code);
  }
}

export interface BiometricPort {
  /** A biometria do aparelho está pronta para uso (hardware e cadastro)? */
  check(): Promise<{ available: boolean; reason?: string }>;
  /** Pede a biometria; rejeita com {@link BiometricFailure}. */
  authenticate(reason: string): Promise<void>;
}

export interface PrivacyPort {
  /** Oculta o conteúdo na visão de apps recentes (no Android, também bloqueia capturas de tela). */
  enable(): Promise<void>;
  disable(): Promise<void>;
}

/**
 * Dublês dos plugins nativos para os testes de ponta a ponta no navegador. Só valem em build de
 * desenvolvimento (`isDevMode`); no build de produção são ignorados.
 */
interface NativeDoubles {
  biometric?: { available: boolean; reason?: string; results: string[]; defaultResult?: string };
  privacy?: { enable(): void; disable(): void };
  notifications?: NotificationDoubles;
}

/** Forma dos dublês de notificação (usada na história de lembretes). */
export interface NotificationDoubles {
  permission: 'granted' | 'denied' | 'prompt';
  scheduled: { id: number; at: string; title: string; body: string; route: string }[];
  /** Simula o toque do usuário em um aviso. */
  tapListeners?: ((route: string) => void)[];
}

export function nativeDoubles(): NativeDoubles | undefined {
  return isDevMode() ? (window as { __gefincNative?: NativeDoubles }).__gefincNative : undefined;
}

const CANCELLED = ['userCancel', 'systemCancel', 'appCancel', 'userFallback'];
const UNAVAILABLE = ['biometryNotAvailable', 'biometryNotEnrolled', 'noDeviceCredential', 'passcodeNotSet'];

function toFailure(error: unknown): BiometricFailure {
  if (error instanceof BiometryError) {
    const code = String(error.code);
    if (CANCELLED.includes(code)) return new BiometricFailure('cancelled');
    if (code === 'biometryLockout') return new BiometricFailure('lockout');
    if (UNAVAILABLE.includes(code)) return new BiometricFailure('unavailable');
  }
  return new BiometricFailure('failed');
}

export function biometricPort(): BiometricPort {
  const double = nativeDoubles()?.biometric;
  if (double) {
    return {
      check: async () => (double.available ? { available: true } : { available: false, ...(double.reason ? { reason: double.reason } : {}) }),
      authenticate: async () => {
        const result = double.results.shift() ?? double.defaultResult ?? 'ok';
        if (result !== 'ok') {
          throw new BiometricFailure(result as BiometricFailureCode);
        }
      },
    };
  }
  return {
    check: async () => {
      const result = await BiometricAuth.checkBiometry();
      return result.isAvailable ? { available: true } : { available: false, ...(result.reason ? { reason: result.reason } : {}) };
    },
    authenticate: async (reason) => {
      try {
        // Só a biometria: a senha do aparelho não substitui o desbloqueio do GEFINC.
        await BiometricAuth.authenticate({ reason, cancelTitle: 'Cancelar', allowDeviceCredential: false, androidTitle: 'GEFINC', androidSubtitle: reason });
      } catch (error) {
        throw toFailure(error);
      }
    },
  };
}

export function privacyPort(): PrivacyPort {
  const double = nativeDoubles()?.privacy;
  if (double) {
    return { enable: async () => double.enable(), disable: async () => double.disable() };
  }
  return {
    enable: () => PrivacyScreen.enable(),
    disable: () => PrivacyScreen.disable(),
  };
}

export const BIOMETRIC_PORT = new InjectionToken<BiometricPort>('BIOMETRIC_PORT', { providedIn: 'root', factory: () => biometricPort() });
export const PRIVACY_PORT = new InjectionToken<PrivacyPort>('PRIVACY_PORT', { providedIn: 'root', factory: () => privacyPort() });

export type NotificationPermission = 'granted' | 'denied' | 'prompt';

export interface ScheduledNotification {
  id: number;
  at: Date;
  title: string;
  body: string;
  /** Rota aberta ao tocar no aviso. */
  route: string;
}

export interface NotificationsPort {
  permission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  cancelAll(): Promise<void>;
  schedule(items: ScheduledNotification[]): Promise<void>;
  /** Chamado quando o usuário toca em um aviso. */
  onTap(listener: (route: string) => void): Promise<void>;
}

const CHANNEL = 'vencimentos';

const toPermission = (display: string): NotificationPermission => (display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt');

export function notificationsPort(): NotificationsPort {
  const double = nativeDoubles()?.notifications;
  if (double) {
    return {
      permission: async () => double.permission,
      requestPermission: async () => {
        if (double.permission === 'prompt') {
          double.permission = 'granted';
        }
        return double.permission;
      },
      cancelAll: async () => void (double.scheduled.length = 0),
      schedule: async (items) => void double.scheduled.push(...items.map((i) => ({ id: i.id, at: i.at.toISOString(), title: i.title, body: i.body, route: i.route }))),
      onTap: async (listener) => void (double.tapListeners ??= []).push(listener),
    };
  }
  return {
    permission: async () => toPermission((await LocalNotifications.checkPermissions()).display),
    requestPermission: async () => toPermission((await LocalNotifications.requestPermissions()).display),
    cancelAll: async () => {
      const { notifications } = await LocalNotifications.getPending();
      if (notifications.length > 0) {
        await LocalNotifications.cancel({ notifications });
      }
    },
    schedule: async (items) => {
      if (items.length === 0) {
        return;
      }
      try {
        await LocalNotifications.createChannel({ id: CHANNEL, name: 'Lembretes de vencimento', importance: 3 });
      } catch {
        // iOS e navegador não têm canais.
      }
      await LocalNotifications.schedule({
        notifications: items.map((i) => ({
          id: i.id,
          title: i.title,
          body: i.body,
          channelId: CHANNEL,
          // Alarme inexato: o exato faria o Android abrir a tela "Alarmes e lembretes" pedindo permissão.
          schedule: { at: i.at, allowWhileIdle: true },
          isExactNotification: false,
          extra: { route: i.route },
        })),
      });
    },
    onTap: async (listener) => {
      await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const route = (event.notification.extra as { route?: string } | undefined)?.route;
        if (route) {
          listener(route);
        }
      });
    },
  };
}

export const NOTIFICATIONS_PORT = new InjectionToken<NotificationsPort>('NOTIFICATIONS_PORT', { providedIn: 'root', factory: () => notificationsPort() });
