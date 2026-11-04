import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthApi, SessionService, messageFor, toProblem } from '../../api';
import { isoToBR } from '@gefinc/utils';

/** Exclusão da conta: agenda o apagamento definitivo para 30 dias, com possibilidade de desistir. */
@Component({
  selector: 'gef-delete-account',
  host: { class: 'block' },
  imports: [ReactiveFormsModule],
  template: `
    <section class="mx-auto max-w-lg space-y-4">
      @if (embedded()) {
        <h2 class="text-title-md font-bold text-gefinc-text">Excluir minha conta</h2>
      } @else {
        <h1 class="text-title-lg font-bold text-gefinc-text">Excluir minha conta</h1>
      }
      @if (scheduledFor(); as date) {
        <p class="gef-alert-success" role="status">
          Exclusão agendada para {{ date }}. Até lá, entre novamente e cancele se mudar de ideia.
        </p>
        <button type="button" class="gef-btn-secondary" (click)="goToLogin()">Ir para o login</button>
      } @else {
        <p class="text-body-base text-gefinc-muted">
          Todos os seus dados serão apagados definitivamente após 30 dias. Durante esse prazo você pode cancelar
          a exclusão entrando com seu e-mail e senha. Ao confirmar, você será desconectado de todos os dispositivos.
        </p>
        @if (error(); as message) {
          <p class="gef-alert-error" role="alert">{{ message }}</p>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
          <div>
            <label class="gef-label" for="password">Confirme com a sua senha</label>
            <input id="password" class="gef-input" type="password" autocomplete="current-password" formControlName="password" />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <p class="gef-field-error">Informe a senha.</p>
            }
          </div>
          <button type="submit" class="gef-btn-danger" [disabled]="busy()">Excluir minha conta</button>
        </form>
      }
    </section>
  `,
})
export class DeleteAccount {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  /** Dentro de outra tela (ex.: Minha conta), o título vira subtítulo. */
  readonly embedded = input(false);

  protected readonly form = this.fb.nonNullable.group({ password: ['', Validators.required] });
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly scheduledFor = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    this.api.requestAccountDeletion(this.form.getRawValue().password).subscribe({
      next: ({ deletionDate }) => {
        this.session.endLocalSession();
        this.scheduledFor.set(isoToBR(deletionDate));
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(messageFor(toProblem(e)));
      },
    });
  }

  protected goToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
