import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { UserNotice } from '@gefinc/core-models';
import { AuthApi, SessionService, SystemApi, messageFor, toProblem } from '../../api';
import { isoToBR } from '@gefinc/utils';
import { switchMap } from 'rxjs';
import { AuthCard } from '../auth-card';

@Component({
  selector: 'gef-login',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  template: `
    <gef-auth-card heading="Entrar">
      @if (maintenanceMessage(); as maintMsg) {
        <div class="gef-alert-warning mb-4" role="alert" data-testid="maintenance-banner">
          <p class="font-medium">Sistema em manutenção</p>
          <p class="mt-1 text-sm">{{ maintMsg }}</p>
        </div>
      }
      @if (cancellationNotice(); as notice) {
        <div class="gef-alert-warning mb-4 flex items-start justify-between gap-3" role="alert" data-testid="cancellation-notice">
          <div class="flex items-start gap-2">
            <svg class="h-5 w-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3 2 20h20zM12 10v5M12 18h.01"/>
            </svg>
            <p>{{ notice.message }}</p>
          </div>
          <button type="button" class="text-caption font-medium underline shrink-0 hover:text-gefinc-text" (click)="dismissNotice(notice.id)" data-testid="dismiss-notice">
            Dispensar
          </button>
        </div>
      }
      @if (pendingDeletionDate(); as date) {
        <div class="gef-alert-warning mb-4" role="alert" data-testid="deletion-warning">
          <div class="flex items-start gap-2">
            <svg class="h-5 w-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3 2 20h20zM12 10v5M12 18h.01"/>
            </svg>
            <div class="space-y-1">
              <p>A exclusão desta conta está agendada para {{ date }}.</p>
              @if (reasonMessage(); as reason) {
                <p class="text-sm font-medium">{{ reason }}</p>
              }
              @if (supportHint(); as hint) {
                <p class="text-sm">{{ hint }}</p>
              }
              @if (canCancel()) {
                <p class="mt-1">Se quiser manter a conta e seus dados, cancele a exclusão.</p>
                <button type="button" class="gef-btn-secondary mt-3" [disabled]="busy()" (click)="cancelDeletionAndLogin()">
                  Cancelar a exclusão e entrar
                </button>
              }
            </div>
          </div>
        </div>
      }
      @if (error(); as message) {
        <p class="gef-alert-error mb-4" role="alert">{{ message }}</p>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
        <div>
          <label class="gef-label" for="email">E-mail</label>
          <input id="email" class="gef-input" type="email" autocomplete="username" formControlName="email" />
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <p class="gef-field-error">Informe um e-mail válido.</p>
          }
        </div>
        <div>
          <label class="gef-label" for="password">Senha</label>
          <input id="password" class="gef-input" type="password" autocomplete="current-password" formControlName="password" />
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <p class="gef-field-error">Informe a senha.</p>
          }
        </div>
        <button type="submit" class="gef-btn-primary" [disabled]="busy()">Entrar</button>
      </form>
      <a class="gef-btn-secondary mt-3 block w-full text-center" routerLink="/forgot-password">Esqueci a senha</a>
      <div class="mt-3 space-y-3 border-t border-gefinc-border pt-5 text-center">
        <p class="text-caption text-gefinc-muted">Ainda não tem conta?</p>
        <a class="gef-btn-secondary block w-full text-center" routerLink="/register">Criar conta</a>
      </div>
      <p class="mt-5 text-center text-caption text-gefinc-muted">
        <a class="underline underline-offset-2 hover:text-gefinc-text" routerLink="/privacidade" data-testid="privacy-link">Privacidade: o que guardamos das sessões</a>
      </p>
    </gef-auth-card>
  `,
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly session = inject(SessionService);
  private readonly api = inject(AuthApi);
  private readonly systemApi = inject(SystemApi);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly pendingDeletionDate = signal<string | null>(null);
  protected readonly canCancel = signal<boolean>(true);
  protected readonly reasonMessage = signal<string | null>(null);
  protected readonly supportHint = signal<string | null>(null);
  protected readonly cancellationNotice = signal<UserNotice | null>(null);
  protected readonly maintenanceMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.systemApi.status().subscribe({
      next: (s) => {
        if (s.maintenance) {
          this.maintenanceMessage.set(s.message || 'Sistema em manutenção no momento.');
        }
      },
      error: () => {
        // Silencioso se status falhar
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.pendingDeletionDate.set(null);
    this.reasonMessage.set(null);
    this.supportHint.set(null);
    this.cancellationNotice.set(null);
    this.busy.set(true);
    this.session.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (e: unknown) => this.fail(e),
    });
  }

  protected cancelDeletionAndLogin(): void {
    const credentials = this.form.getRawValue();
    this.error.set(null);
    this.busy.set(true);
    this.api
      .cancelAccountDeletion(credentials)
      .pipe(switchMap(() => this.session.login(credentials)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (e: unknown) => this.fail(e),
      });
  }

  protected dismissNotice(noticeId: number): void {
    this.cancellationNotice.set(null);
    this.api.dismissNotice(noticeId).subscribe({
      error: () => {
        // Silencioso se dispensa falhar
      },
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    const problem = toProblem(error);
    const notices = (problem.extras?.['notices'] as UserNotice[] | undefined) ?? [];
    if (notices.length > 0) {
      this.cancellationNotice.set(notices[0]);
    }
    if (problem.code === 'ACCOUNT_DELETION_PENDING') {
      this.pendingDeletionDate.set(isoToBR(String(problem.extras['deletionDate'] ?? '')));
      this.canCancel.set(problem.extras['canCancel'] !== false);
      this.reasonMessage.set((problem.extras['reasonMessage'] as string) ?? null);
      this.supportHint.set((problem.extras['supportHint'] as string) ?? null);
      return;
    }
    this.error.set(messageFor(problem));
  }
}
