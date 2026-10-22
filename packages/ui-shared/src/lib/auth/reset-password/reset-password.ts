import { Component, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthApi, messageFor, passwordPolicyValidator, toProblem } from '../../api';
import { AuthCard } from '../auth-card';

function samePassword(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'gef-reset-password',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  template: `
    <gef-auth-card heading="Criar nova senha">
      @if (done()) {
        <p class="gef-alert-success" role="status">Senha alterada. Entre com a nova senha.</p>
        <a class="gef-btn-secondary mt-4 block text-center" routerLink="/login">Ir para o login</a>
      } @else if (!token()) {
        <p class="gef-alert-error" role="alert">Link inválido. Solicite um novo.</p>
        <a class="gef-btn-secondary mt-4 block text-center" routerLink="/forgot-password">Solicitar novo link</a>
      } @else {
        @if (error(); as message) {
          <p class="gef-alert-error mb-4" role="alert">{{ message }}</p>
          @if (linkExpired()) {
            <a class="gef-btn-secondary mb-4 block text-center" routerLink="/forgot-password">Solicitar novo link</a>
          }
        }
        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
          <div>
            <label class="gef-label" for="password">Nova senha</label>
            <input id="password" class="gef-input" type="password" autocomplete="new-password" formControlName="password" />
            <p class="mt-1 text-caption text-gefinc-muted">Mínimo de 10 caracteres.</p>
            @if (form.controls.password.touched && form.controls.password.errors?.['passwordPolicy']; as reason) {
              <p class="gef-field-error">{{ reason }}</p>
            }
          </div>
          <div>
            <label class="gef-label" for="confirm">Confirme a nova senha</label>
            <input id="confirm" class="gef-input" type="password" autocomplete="new-password" formControlName="confirm" />
            @if (form.controls.confirm.touched && form.errors?.['mismatch']) {
              <p class="gef-field-error">As senhas não conferem.</p>
            }
          </div>
          <button type="submit" class="gef-btn-primary" [disabled]="busy()">Alterar senha</button>
        </form>
      }
    </gef-auth-card>
  `,
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AuthApi);

  /** Recebido do link do e-mail (`?token=...`) pela ligação de parâmetros da rota. */
  readonly token = input<string>();

  protected readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, passwordPolicyValidator]],
      confirm: ['', Validators.required],
    },
    { validators: samePassword },
  );
  protected readonly error = signal<string | null>(null);
  protected readonly linkExpired = signal(false);
  protected readonly done = signal(false);
  protected readonly busy = signal(false);

  protected submit(): void {
    const token = this.token();
    if (this.form.invalid || !token) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    this.api.confirmPasswordReset(token, this.form.getRawValue().password).subscribe({
      next: () => this.done.set(true),
      error: (e: unknown) => {
        this.busy.set(false);
        const problem = toProblem(e);
        this.linkExpired.set(problem.code === 'INVALID_RESET_TOKEN');
        this.error.set(messageFor(problem));
      },
    });
  }
}
