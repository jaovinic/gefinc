import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthApi, CurrentUser, NoticeService, SessionService, messageFor, passwordPolicyValidator, toProblem, userInitial } from '../../api';
import { Icon } from '../../icons/icon';
import { GlassToggle } from '../../theme/glass-toggle';
import { ThemeToggle } from '../../theme/theme-toggle';
import { Avatar } from '../avatar/avatar';
import { DeleteAccount } from '../delete-account/delete-account';

function samePassword(group: AbstractControl): ValidationErrors | null {
  return group.get('newPassword')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

/**
 * Minha conta: cabeçalho com o nome e o e-mail, edição do nome, troca de senha e exclusão da conta.
 * O conteúdo projetado (ex.: biometria e lembretes do app) entra entre a senha e a exclusão.
 */
@Component({
  selector: 'gef-profile-page',
  imports: [Avatar, DeleteAccount, GlassToggle, Icon, ReactiveFormsModule, ThemeToggle],
  template: `
    <section class="mx-auto max-w-2xl space-y-6">
      <h1 class="text-title-lg font-bold">Minha conta</h1>

      <div class="flex items-center gap-4 gef-card p-4" data-testid="profile-header">
        <gef-avatar [initial]="initial()" size="lg" />
        <div class="min-w-0">
          <p class="truncate text-title-md font-bold" data-testid="profile-name">{{ savedName() || 'Sem nome' }}</p>
          <p class="truncate text-body-base text-gefinc-muted" data-testid="profile-email">{{ email() }}</p>
        </div>
      </div>

      <section class="space-y-3 gef-card p-4" aria-labelledby="appearance-title">
        <h2 id="appearance-title" class="text-title-md font-bold">Aparência</h2>
        <p class="text-body-base text-gefinc-muted">Escolha o tema claro, o escuro ou siga o do seu aparelho.</p>
        <gef-theme-toggle />
        <gef-glass-toggle />
      </section>

      <section class="space-y-4 gef-card p-4" aria-labelledby="name-title">
        <h2 id="name-title" class="flex items-center gap-2 text-title-md font-bold"><gef-icon name="user" [size]="18" />Dados pessoais</h2>
        <form [formGroup]="nameForm" (ngSubmit)="saveName()" class="space-y-4" novalidate>
          @if (nameError(); as message) {
            <p class="gef-alert-error" role="alert">{{ message }}</p>
          }
          <div>
            <label class="gef-label" for="profile-name-input">Nome</label>
            <input
              id="profile-name-input"
              class="gef-input"
              formControlName="name"
              maxlength="80"
              autocomplete="name"
              autocapitalize="words"
              enterkeyhint="done"
              placeholder="Como você quer ser chamado"
            />
          </div>
          <div>
            <label class="gef-label" for="profile-email-input">E-mail</label>
            <input id="profile-email-input" class="gef-input" [value]="email()" readonly aria-describedby="email-hint" />
            <p id="email-hint" class="mt-1 text-caption text-gefinc-muted">O e-mail é o seu acesso e não pode ser alterado por aqui.</p>
          </div>
          <button type="submit" class="gef-btn-primary" [disabled]="nameBusy() || !nameChanged()">
            {{ nameBusy() ? 'Salvando…' : 'Salvar nome' }}
          </button>
        </form>
      </section>

      <section class="space-y-4 gef-card p-4" aria-labelledby="password-title">
        <h2 id="password-title" class="text-title-md font-bold">Alterar senha</h2>
        <p class="text-body-base text-gefinc-muted">
          Ao trocar, os outros aparelhos conectados saem da conta. Este continua conectado.
        </p>
        <form [formGroup]="passwordForm" (ngSubmit)="savePassword()" class="space-y-4" novalidate>
          @if (passwordError(); as message) {
            <p class="gef-alert-error" role="alert">{{ message }}</p>
          }
          @if (passwordDone()) {
            <p class="gef-alert-success" role="status">Senha alterada.</p>
          }
          <div>
            <label class="gef-label" for="current-password">Senha atual</label>
            <input id="current-password" class="gef-input" type="password" autocomplete="current-password" formControlName="currentPassword" />
            @if (passwordForm.controls.currentPassword.touched && passwordForm.controls.currentPassword.invalid) {
              <p class="gef-field-error">Informe a senha atual.</p>
            }
            @if (serverErrors()['currentPassword']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </div>
          <div>
            <label class="gef-label" for="new-password">Nova senha</label>
            <input id="new-password" class="gef-input" type="password" autocomplete="new-password" formControlName="newPassword" />
            <p class="mt-1 text-caption text-gefinc-muted">Mínimo de 10 caracteres.</p>
            @if (passwordForm.controls.newPassword.touched && passwordForm.controls.newPassword.errors?.['passwordPolicy']; as reason) {
              <p class="gef-field-error">{{ reason }}</p>
            }
            @if (serverErrors()['newPassword']; as message) {
              <p class="gef-field-error">{{ message }}</p>
            }
          </div>
          <div>
            <label class="gef-label" for="confirm-password">Confirme a nova senha</label>
            <input id="confirm-password" class="gef-input" type="password" autocomplete="new-password" formControlName="confirm" />
            @if (passwordForm.controls.confirm.touched && passwordForm.errors?.['mismatch']) {
              <p class="gef-field-error">As senhas não conferem.</p>
            }
          </div>
          <button type="submit" class="gef-btn-primary" [disabled]="passwordBusy()">
            {{ passwordBusy() ? 'Alterando…' : 'Alterar senha' }}
          </button>
        </form>
      </section>

      <ng-content />

      <gef-delete-account [embedded]="true" />
    </section>
  `,
})
export class ProfilePage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);
  private readonly notices = inject(NoticeService);
  private readonly currentUser = inject(CurrentUser);

  protected readonly email = signal('');
  protected readonly savedName = signal('');

  protected readonly nameForm = this.fb.nonNullable.group({ name: ['', Validators.maxLength(80)] });
  protected readonly nameError = signal<string | null>(null);
  protected readonly nameBusy = signal(false);
  private readonly typedName = signal('');
  protected readonly nameChanged = computed(() => this.typedName().trim() !== this.savedName());

  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordPolicyValidator]],
      confirm: ['', Validators.required],
    },
    { validators: samePassword },
  );
  protected readonly passwordError = signal<string | null>(null);
  protected readonly passwordDone = signal(false);
  protected readonly passwordBusy = signal(false);
  protected readonly serverErrors = signal<Record<string, string>>({});

  protected readonly initial = computed(() => userInitial(this.savedName(), this.email()));

  constructor() {
    this.nameForm.controls.name.valueChanges.subscribe((value) => this.typedName.set(value));
  }

  ngOnInit(): void {
    this.api.me().subscribe({
      next: (profile) => {
        this.currentUser.apply(profile);
        this.email.set(profile.email);
        this.applyName(profile.name ?? '');
      },
      error: (e: unknown) => this.nameError.set(messageFor(toProblem(e))),
    });
  }

  protected saveName(): void {
    if (this.nameForm.invalid || this.nameBusy()) {
      return;
    }
    this.nameError.set(null);
    this.nameBusy.set(true);
    this.api.updateName(this.nameForm.getRawValue().name).subscribe({
      next: (profile) => {
        this.nameBusy.set(false);
        this.currentUser.apply(profile);
        this.applyName(profile.name ?? '');
        this.notices.toast('Nome atualizado.');
      },
      error: (e: unknown) => {
        this.nameBusy.set(false);
        this.nameError.set(messageFor(toProblem(e)));
      },
    });
  }

  protected savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.passwordError.set(null);
    this.passwordDone.set(false);
    this.serverErrors.set({});
    this.passwordBusy.set(true);
    this.api.changePassword(currentPassword, newPassword, this.session.clientHeaders()).subscribe({
      next: (tokens) => {
        this.session.adopt(tokens);
        this.passwordBusy.set(false);
        this.passwordForm.reset();
        this.passwordDone.set(true);
        this.notices.toast('Senha alterada.');
      },
      error: (e: unknown) => {
        this.passwordBusy.set(false);
        const problem = toProblem(e);
        this.serverErrors.set(problem.fieldErrors);
        if (Object.keys(problem.fieldErrors).length === 0) {
          this.passwordError.set(messageFor(problem));
        }
      },
    });
  }

  private applyName(name: string): void {
    this.savedName.set(name);
    this.typedName.set(name);
    this.nameForm.controls.name.setValue(name, { emitEvent: false });
  }
}
