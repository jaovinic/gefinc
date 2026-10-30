import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi, SessionService, messageFor, toProblem } from '../../api';
import { isoToBR } from '@gefinc/utils';
import { switchMap } from 'rxjs';
import { AuthCard } from '../auth-card';

@Component({
  selector: 'gef-login',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  template: `
    <gef-auth-card heading="Entrar">
      @if (pendingDeletionDate(); as date) {
        <div class="gef-alert-warning mb-4" role="alert">
          <p>A exclusão desta conta está agendada para {{ date }}.</p>
          <p class="mt-1">Se quiser manter a conta e seus dados, cancele a exclusão.</p>
          <button type="button" class="gef-btn-secondary mt-3" [disabled]="busy()" (click)="cancelDeletionAndLogin()">
            Cancelar a exclusão e entrar
          </button>
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
    </gef-auth-card>
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly session = inject(SessionService);
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly pendingDeletionDate = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.pendingDeletionDate.set(null);
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

  private fail(error: unknown): void {
    this.busy.set(false);
    const problem = toProblem(error);
    if (problem.code === 'ACCOUNT_DELETION_PENDING') {
      this.pendingDeletionDate.set(isoToBR(String(problem.extras['deletionDate'] ?? '')));
      return;
    }
    this.error.set(messageFor(problem));
  }
}
