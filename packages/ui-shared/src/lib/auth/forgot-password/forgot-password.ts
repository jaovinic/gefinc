import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthApi, CLIENT_KIND, messageFor, toProblem } from '../../api';
import { AuthCard } from '../auth-card';

@Component({
  selector: 'gef-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  template: `
    <gef-auth-card heading="Recuperar senha">
      @if (sent()) {
        <p class="gef-alert-success" role="status">
          Se o e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Ele vale por 60 minutos.
          @if (mobile) {
            O link abre no navegador do celular; depois de criar a nova senha, volte ao aplicativo e entre.
          }
        </p>
        <a class="gef-btn-secondary mt-4 block w-full text-center" routerLink="/login">Voltar para o login</a>
      } @else {
        @if (error(); as message) {
          <p class="gef-alert-error mb-4" role="alert">{{ message }}</p>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
          <div>
            <label class="gef-label" for="email">E-mail cadastrado</label>
            <input id="email" class="gef-input" type="email" autocomplete="username" formControlName="email" />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <p class="gef-field-error">Informe um e-mail válido.</p>
            }
          </div>
          <button type="submit" class="gef-btn-primary" [disabled]="busy()">Enviar link</button>
        </form>
        <a class="gef-btn-secondary mt-4 block w-full text-center" routerLink="/login">Voltar para o login</a>
      }
    </gef-auth-card>
  `,
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AuthApi);
  /** No app, o link do e-mail abre no navegador (não no aplicativo). */
  protected readonly mobile = inject(CLIENT_KIND) === 'mobile';

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    this.api.requestPasswordReset(this.form.getRawValue().email).subscribe({
      next: () => this.sent.set(true),
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(messageFor(toProblem(e)));
      },
    });
  }
}
