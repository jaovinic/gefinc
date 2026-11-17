import { Component, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { InvitationPreview } from '@gefinc/core-models';
import { AuthApi, SessionService, messageFor, passwordPolicyValidator, toProblem } from '../../api';
import { switchMap } from 'rxjs';
import { AuthCard } from '../auth-card';

function samePassword(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'gef-invitation-accept',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  template: `
    <gef-auth-card heading="Aceitar convite">
      @if (loading()) {
        <p class="text-caption text-gefinc-muted" role="status">Carregando convite…</p>
      } @else if (expired()) {
        <div class="space-y-4">
          <p class="gef-alert-error" role="alert">Este convite expirou ou já foi utilizado.</p>
          <p class="text-caption text-gefinc-muted">Solicite um novo convite ao administrador do sistema.</p>
          <a class="gef-btn-secondary block text-center" routerLink="/login">Ir para o login</a>
        </div>
      } @else if (notFound()) {
        <div class="space-y-4">
          <p class="gef-alert-error" role="alert">Convite não encontrado ou link inválido.</p>
          <a class="gef-btn-secondary block text-center" routerLink="/login">Ir para o login</a>
        </div>
      } @else {
        @if (error(); as message) {
          <p class="gef-alert-error mb-4" role="alert" data-testid="accept-error">{{ message }}</p>
        }
        @if (preview(); as inv) {
          <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
            <div>
              <label class="gef-label" for="email">E-mail</label>
              <input id="email" class="gef-input bg-gefinc-bg-alt opacity-80" type="email" [value]="inv.email" disabled />
            </div>
            <div>
              <label class="gef-label" for="name">Nome (opcional)</label>
              <input id="name" class="gef-input" type="text" autocomplete="name" maxlength="80" formControlName="name" />
              @if (form.controls.name.touched && form.controls.name.invalid) {
                <p class="gef-field-error">O nome pode ter no máximo 80 caracteres.</p>
              }
            </div>
            <div>
              <label class="gef-label" for="password">Senha</label>
              <input id="password" class="gef-input" type="password" autocomplete="new-password" formControlName="password" />
              <p class="mt-1 text-caption text-gefinc-muted">Mínimo de 10 caracteres.</p>
              @if (form.controls.password.touched && form.controls.password.errors?.['passwordPolicy']; as reason) {
                <p class="gef-field-error" data-testid="password-error">{{ reason }}</p>
              }
              @if (serverErrors()['password']; as message) {
                <p class="gef-field-error">{{ message }}</p>
              }
            </div>
            <div>
              <label class="gef-label" for="confirm">Confirme a senha</label>
              <input id="confirm" class="gef-input" type="password" autocomplete="new-password" formControlName="confirm" />
              @if (form.controls.confirm.touched && form.errors?.['mismatch']) {
                <p class="gef-field-error" data-testid="confirm-error">As senhas não conferem.</p>
              }
            </div>
            <button type="submit" class="gef-btn-primary" [disabled]="busy()" data-testid="accept-submit">
              {{ busy() ? 'Criando conta…' : 'Concluir cadastro' }}
            </button>
          </form>
        }
      }
    </gef-auth-card>
  `,
})
export class InvitationAccept implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Token da URL informado na rota. */
  readonly token = input<string>();

  protected readonly preview = signal<InvitationPreview | null>(null);
  protected readonly loading = signal(true);
  protected readonly expired = signal(false);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      name: [''],
      password: ['', [Validators.required, passwordPolicyValidator]],
      confirm: ['', Validators.required],
    },
    { validators: samePassword },
  );

  ngOnInit(): void {
    const rawToken = this.token() ?? this.route.snapshot.paramMap.get('token') ?? '';
    if (!rawToken) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.api.getInvitation(rawToken).subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loading.set(false);
        const problem = toProblem(e);
        if (problem.code === 'INVITATION_EXPIRED' || problem.status === 410) {
          this.expired.set(true);
        } else {
          this.notFound.set(true);
        }
      },
    });
  }

  protected submit(): void {
    const rawToken = this.token() ?? this.route.snapshot.paramMap.get('token') ?? '';
    const inv = this.preview();
    if (this.form.invalid || !rawToken || !inv) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, password } = this.form.getRawValue();
    this.error.set(null);
    this.serverErrors.set({});
    this.busy.set(true);

    this.api
      .acceptInvitation(rawToken, { password, name: name.trim() || undefined })
      .pipe(switchMap(() => this.session.login({ email: inv.email, password })))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (e: unknown) => {
          this.busy.set(false);
          const problem = toProblem(e);
          if (problem.code === 'MAINTENANCE' || problem.status === 503) {
            this.error.set(
              problem.detail || 'O sistema está em manutenção no momento. Tente novamente mais tarde.',
            );
          } else if (problem.code === 'INVITATION_EXPIRED' || problem.status === 410) {
            this.expired.set(true);
          } else {
            this.serverErrors.set(problem.fieldErrors);
            this.error.set(Object.keys(problem.fieldErrors).length > 0 ? null : messageFor(problem));
          }
        },
      });
  }
}
