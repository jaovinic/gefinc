import { Injectable, inject, signal } from '@angular/core';
import { BIOMETRIC_PORT, BiometricFailure } from '../native/native-ports';
import { DevicePreferences } from './device-preferences';

export type LockChange = { ok: true } | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' | 'lockout'; message: string };

/** Janela depois do diálogo da biometria em que eventos de segundo plano ainda são do próprio diálogo. */
const PROMPT_GRACE_MS = 2_000;

const MESSAGES = {
  failed: 'Biometria não reconhecida. Tente de novo.',
  lockout: 'Muitas tentativas. Use seu e-mail e senha para entrar.',
  unavailable: 'O desbloqueio por biometria foi desativado porque a biometria não está mais disponível neste aparelho. Entre com e-mail e senha.',
  notEnrolled: 'Biometria indisponível neste aparelho. Cadastre uma digital ou o rosto nas configurações do aparelho e tente de novo.',
  cancelled: 'Confirmação cancelada.',
} as const;

/**
 * Bloqueio do app por biometria (opcional, desligado por padrão). Com o bloqueio ligado, o conteúdo
 * fica coberto até a biometria ser confirmada: na abertura do app e quando ele volta do segundo plano
 * depois do tempo escolhido. A biometria só destrava a tela e a sessão já guardada: não vai ao servidor e
 * não substitui a senha onde ela é exigida (ex.: excluir a conta).
 */
@Injectable({ providedIn: 'root' })
export class AppLockService {
  private readonly prefs = inject(DevicePreferences);
  private readonly biometric = inject(BIOMETRIC_PORT);

  readonly locked = signal(false);
  readonly failures = signal(0);
  /** Aviso mostrado na tela de bloqueio. */
  readonly message = signal<string | null>(null);
  /** A biometria não serve mais (bloqueada ou indisponível): só e-mail e senha. */
  readonly passwordRequired = signal(false);

  private backgroundedAt = 0;
  /** O diálogo da biometria está aberto (ou acabou de fechar): o Android pausa e retoma o app por causa dele. */
  private promptActive = false;
  private promptEndedAt = 0;

  /** Abertura do app: carrega as preferências e, com o bloqueio ligado, começa bloqueado. */
  async start(): Promise<void> {
    await this.prefs.load();
    if (this.prefs.lock().enabled) {
      this.locked.set(true);
    }
  }

  /** Depois de entrar com a senha: aplica as preferências do usuário sem bloquear. */
  async onSignedIn(): Promise<void> {
    await this.prefs.load();
  }

  async onSignedOut(): Promise<void> {
    this.locked.set(false);
    this.failures.set(0);
    this.message.set(null);
    this.passwordRequired.set(false);
  }

  async enable(timeoutMinutes: number): Promise<LockChange> {
    const check = await this.biometric.check();
    if (!check.available) {
      return { ok: false, reason: 'unavailable', message: check.reason ?? MESSAGES.notEnrolled };
    }
    const confirmed = await this.confirm('Confirme para ativar o bloqueio do GEFINC');
    if (!confirmed.ok) {
      return confirmed;
    }
    await this.prefs.setLock({ enabled: true, timeoutMinutes });
    return { ok: true };
  }

  async disable(): Promise<LockChange> {
    const confirmed = await this.confirm('Confirme para desativar o bloqueio do GEFINC');
    if (!confirmed.ok) {
      return confirmed;
    }
    await this.prefs.setLock({ enabled: false });
    this.locked.set(false);
    return { ok: true };
  }

  async unlock(): Promise<void> {
    try {
      await this.askBiometric('Desbloquear o GEFINC');
      this.locked.set(false);
      this.failures.set(0);
      this.message.set(null);
      this.passwordRequired.set(false);
    } catch (error) {
      const code = error instanceof BiometricFailure ? error.code : 'failed';
      if (code === 'cancelled') {
        this.message.set(null);
      } else if (code === 'failed') {
        this.failures.update((n) => n + 1);
        this.message.set(MESSAGES.failed);
      } else if (code === 'lockout') {
        this.message.set(MESSAGES.lockout);
        this.passwordRequired.set(true);
      } else {
        await this.biometricGone();
      }
    }
  }

  onBackgrounded(): void {
    if (this.inPrompt()) {
      return;
    }
    this.backgroundedAt = Date.now();
  }

  async onForegrounded(): Promise<void> {
    const { enabled, timeoutMinutes } = this.prefs.lock();
    if (!enabled || this.inPrompt()) {
      return;
    }
    const check = await this.biometric.check();
    if (!check.available) {
      await this.biometricGone();
      return;
    }
    if (Date.now() - this.backgroundedAt >= timeoutMinutes * 60_000) {
      this.locked.set(true);
    }
  }

  private async confirm(reason: string): Promise<LockChange> {
    try {
      await this.askBiometric(reason);
      return { ok: true };
    } catch (error) {
      const code = error instanceof BiometricFailure ? error.code : 'failed';
      return { ok: false, reason: code, message: code === 'cancelled' ? MESSAGES.cancelled : code === 'lockout' ? MESSAGES.lockout : MESSAGES.failed };
    }
  }

  /**
   * Pede a biometria. O diálogo do sistema faz o app ir ao segundo plano e voltar; esses eventos (e os
   * que chegam logo depois de ele fechar) não contam como o usuário ter saído do app, senão o bloqueio
   * se repetiria sem fim.
   */
  private async askBiometric(reason: string): Promise<void> {
    this.promptActive = true;
    try {
      await this.biometric.authenticate(reason);
    } finally {
      this.promptActive = false;
      this.promptEndedAt = Date.now();
    }
  }

  private inPrompt(): boolean {
    return this.promptActive || Date.now() - this.promptEndedAt < PROMPT_GRACE_MS;
  }

  /** A biometria sumiu do aparelho: desliga o bloqueio e só deixa entrar com e-mail e senha. */
  private async biometricGone(): Promise<void> {
    await this.prefs.setLock({ enabled: false });
    this.passwordRequired.set(true);
    this.message.set(MESSAGES.unavailable);
    this.locked.set(true);
  }
}
