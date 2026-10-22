import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi, SessionService, messageFor, passwordPolicyValidator, toProblem } from '../../api';
import { switchMap } from 'rxjs';
import { AuthCard } from '../auth-card';

function samePassword(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'gef-register',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  template: `
    <gef-auth-card heading="Criar conta">
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
          @if (serverErrors()['email']; as message) {
            <p class="gef-field-error">{{ message }}</p>
          }
        </div>
        <div>
          <label class="gef-label" for="password">Senha</label>
          <input id="password" class="gef-input" type="password" autocomplete="new-password" formControlName="password" />
          <p class="mt-1 text-caption text-gefinc-muted">Mínimo de 10 caracteres.</p>
          @if (form.controls.password.touched && form.controls.password.errors?.['passwordPolicy']; as reason) {
            <p class="gef-field-error">{{ reason }}</p>
          }
        </div>
        <div>
          <label class="gef-label" for="confirm">Confirme a senha</label>
          <input id="confirm" class="gef-input" type="password" autocomplete="new-password" formControlName="confirm" />
          @if (form.controls.confirm.touched && form.errors?.['mismatch']) {
            <p class="gef-field-error">As senhas não conferem.</p>
          }
        </div>
        <button type="submit" class="gef-btn-primary" [disabled]="busy()">Criar conta</button>
      </form>
      <div class="mt-4 space-y-3 border-t border-gefinc-border pt-4 text-center">
        <p class="text-caption text-gefinc-muted">Já tem conta?</p>
        <a class="gef-btn-secondary block w-full text-center" routerLink="/login">Entrar</a>
      </div>
    </gef-auth-card>
  `,
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, passwordPolicyValidator]],
      confirm: ['', Validators.required],
    },
    { validators: samePassword },
  );
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.error.set(null);
    this.serverErrors.set({});
    this.busy.set(true);
    this.api
      .register({ email, password })
      .pipe(switchMap(() => this.session.login({ email, password })))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (e: unknown) => {
          this.busy.set(false);
          const problem = toProblem(e);
          this.serverErrors.set(problem.fieldErrors);
          this.error.set(Object.keys(problem.fieldErrors).length > 0 ? null : messageFor(problem));
        },
      });
  }
}
