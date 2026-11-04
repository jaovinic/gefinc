import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CATEGORY_TYPES, ERROR_CODES, type Category, type CategoryType, type CategoryUsage } from '@gefinc/core-models';
import { CategoriesApi, DATA_FRESHNESS, NoticeService, ReferenceData, formatSyncedAt, isOfflineProblem, messageFor, toProblem } from '../api';
import { ConfirmDialog } from '../layout/confirm-dialog';
import { ColorSwatch } from '../color-swatch/color-swatch';
import { Sheet } from '../layout/sheet';
import { Select, type SelectOption } from '../select/select';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';

const TYPE_LABELS: Record<CategoryType, string> = { EXPENSE: 'Despesas', INCOME: 'Receitas' };

/** Categorias de receita e de despesa; só se exclui categoria sem lançamentos (com confirmação), sem mover lançamentos. */
@Component({
  selector: 'gef-categories-page',
  imports: [ReactiveFormsModule, ColorSwatch, ConfirmDialog, EmptyView, ErrorView, LoadingView, Select, Sheet],
  template: `
    <section class="space-y-6">
      <header class="flex items-center justify-between">
        <h1 class="text-title-lg font-bold">Categorias</h1>
        <button type="button" class="gef-btn-secondary" (click)="startCreate()">Nova categoria</button>
      </header>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (loading()) {
        <gef-loading variant="list" message="Carregando categorias…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" [variant]="loadOffline() ? 'offline' : 'error'" (retry)="load()" />
      } @else if (categories().length === 0) {
        <gef-empty
          icon="tag"
          [title]="staleAt() ? 'Nenhuma categoria na última sincronização (' + sync(staleAt()!) + ')' : 'Nenhuma categoria'"
          [hint]="staleAt() ? 'Estes são os dados salvos neste aparelho; podem estar desatualizados. Conecte-se para atualizar.' : 'Crie categorias para classificar receitas e despesas.'"
        />
      } @else {
        @for (type of types; track type) {
          <div>
            <h2 class="mb-2 text-title-md font-semibold">{{ labels[type] }}</h2>
            <ul class="divide-y divide-gefinc-border rounded-xl border border-gefinc-border">
              @for (category of byType(type); track category.id) {
                <li class="flex items-center justify-between px-4 py-3">
                  <span class="flex items-center gap-3">
                    <span class="h-4 w-4 rounded-full" [style.background]="category.colorHex" aria-hidden="true"></span>
                    {{ category.name }}
                  </span>
                  <span class="flex gap-2">
                    <button type="button" class="gef-btn-sm" [attr.aria-label]="'Editar ' + category.name" (click)="startEdit(category)">Editar</button>
                    <button type="button" class="gef-btn-sm gef-btn-sm-danger" [attr.aria-label]="'Excluir ' + category.name" (click)="askDelete(category)">Excluir</button>
                  </span>
                </li>
              }
            </ul>
          </div>
        }
      }
    </section>
    <gef-sheet [heading]="editing() ? 'Editar categoria' : 'Nova categoria'" [open]="formOpen()" (closed)="closeForm()">
      @if (formOpen()) {
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4" novalidate>
          @if (formError(); as text) {
            <p class="gef-alert-error" role="alert">{{ text }}</p>
          }
          <div>
            <label class="gef-label" for="name">Nome</label>
            <input id="name" class="gef-input" formControlName="name" maxlength="60" />
            @if (form.controls.name.touched && form.controls.name.invalid) {
              <p class="gef-field-error">Informe o nome.</p>
            }
          </div>
          <div>
            <gef-select label="Tipo" formControlName="type" [options]="typeOptions" />
            @if (editing()) {
              <p class="mt-1 text-caption text-gefinc-muted">O tipo não pode ser alterado após a criação.</p>
            }
          </div>
          <div>
            <span class="gef-label" aria-hidden="true">Cor</span>
            <gef-color-swatch label="Cor" formControlName="colorHex" />
          </div>
          <div class="flex gap-3">
            <button type="submit" class="gef-btn-primary max-w-40" [disabled]="busy()">{{ busy() ? 'Salvando…' : 'Salvar' }}</button>
            <button type="button" class="gef-btn-secondary" (click)="closeForm()">Cancelar</button>
          </div>
        </form>
      }
    </gef-sheet>
    <gef-confirm-dialog
      [open]="!!deleting()"
      [heading]="deleteBlocked() ? 'Categoria não pode ser excluída' : 'Excluir categoria'"
      [confirmLabel]="deleteLabel()"
      [busy]="deleteBusy()"
      [error]="deleteError()"
      [blocked]="deleteBlocked()"
      (confirmed)="confirmDelete()"
      (cancelled)="closeDelete()"
    >
      @if (deleting(); as pending) {
        <p>A categoria "{{ pending.category.name }}" será excluída definitivamente. Esta ação não pode ser desfeita.</p>
      }
    </gef-confirm-dialog>
  `,
})
export class CategoriesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CategoriesApi);
  private readonly reference = inject(ReferenceData);
  private readonly notices = inject(NoticeService);
  private readonly freshness = inject(DATA_FRESHNESS);

  protected readonly types = CATEGORY_TYPES;
  protected readonly labels = TYPE_LABELS;
  protected readonly typeOptions: SelectOption[] = CATEGORY_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }));
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  /** O erro é falta de conexão (e não uma falha do servidor): a tela mostra o aviso de "Sem conexão". */
  protected readonly loadOffline = signal(false);
  /** De quando é a lista, se veio da cópia local do aparelho (`null`: do servidor). */
  protected readonly staleAt = signal<Date | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly editing = signal<Category | null>(null);
  /** Exclusão em confirmação: a categoria e a prévia do que a impede (GET usage). */
  protected readonly deleting = signal<{ category: Category; usage: CategoryUsage } | null>(null);
  protected readonly deleteBusy = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  private readonly usageLoading = signal(false);
  protected readonly deleteBlocked = computed(() => {
    const pending = this.deleting();
    if (!pending || pending.usage.canDelete) {
      return null;
    }
    const count = Math.max(pending.usage.transactionCount, pending.usage.groupCount);
    return `A categoria "${pending.category.name}" está em uso em ${count} ${count === 1 ? 'lançamento' : 'lançamentos'}. Altere a categoria desses lançamentos e tente novamente.`;
  });
  protected readonly deleteLabel = computed(() => `Excluir categoria "${this.deleting()?.category.name ?? ''}"`);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    type: ['EXPENSE' as CategoryType],
    colorHex: ['#94a3b8'],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list().subscribe({
      next: (list) => {
        this.categories.set(list);
        this.staleAt.set(this.freshness());
        this.loading.set(false);
        this.reference.refresh();
      },
      error: (e: unknown) => {
        const problem = toProblem(e);
        this.loadError.set(messageFor(problem));
        this.loadOffline.set(isOfflineProblem(problem));
        this.loading.set(false);
      },
    });
  }

  protected sync(date: Date): string {
    return formatSyncedAt(date);
  }

  protected byType(type: CategoryType): Category[] {
    return this.categories().filter((c) => c.type === type);
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', type: 'EXPENSE', colorHex: '#94a3b8' });
    this.form.controls.type.enable();
    this.formOpen.set(true);
  }

  protected startEdit(category: Category): void {
    this.editing.set(category);
    this.formError.set(null);
    this.form.reset({ name: category.name, type: category.type, colorHex: category.colorHex });
    this.form.controls.type.disable();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.formError.set(null);
  }

  protected save(): void {
    if (this.busy()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const editing = this.editing();
    const wasEditing = !!editing;
    this.message.set(null);
    this.formError.set(null);
    this.busy.set(true);
    const request = editing ? this.api.update(editing.id, value) : this.api.create(value);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.closeForm();
        this.load();
        this.notices.toast(wasEditing ? 'Categoria atualizada.' : 'Categoria criada.');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.formError.set(messageFor(toProblem(e)));
      },
    });
  }

  /** Consulta o uso da categoria e abre a confirmação: nada é excluído sem o usuário confirmar. */
  protected askDelete(category: Category): void {
    if (this.usageLoading()) {
      return;
    }
    this.message.set(null);
    this.usageLoading.set(true);
    this.api.usage(category.id).subscribe({
      next: (usage) => {
        this.usageLoading.set(false);
        this.deleteError.set(null);
        this.deleting.set({ category, usage });
      },
      error: (e: unknown) => {
        this.usageLoading.set(false);
        const problem = toProblem(e);
        if (problem.status === 404) {
          this.load();
        }
        this.message.set(messageFor(problem));
      },
    });
  }

  protected closeDelete(): void {
    if (!this.deleteBusy()) {
      this.deleting.set(null);
      this.deleteError.set(null);
    }
  }

  protected confirmDelete(): void {
    const pending = this.deleting();
    if (!pending || this.deleteBusy() || this.deleteBlocked()) {
      return;
    }
    this.deleteBusy.set(true);
    this.deleteError.set(null);
    this.api.remove(pending.category.id).subscribe({
      next: () => {
        this.deleteBusy.set(false);
        this.deleting.set(null);
        this.load();
        this.notices.toast('Categoria excluída.');
      },
      error: (e: unknown) => {
        this.deleteBusy.set(false);
        const problem = toProblem(e);
        if (problem.status === 404) {
          this.deleting.set(null);
          this.load();
          this.notices.toast('A categoria já havia sido excluída.');
        } else if (problem.code === ERROR_CODES.categoryInUse) {
          this.refreshUsage(pending.category, messageFor(problem));
        } else {
          this.deleteError.set(messageFor(problem));
        }
      },
    });
  }

  /** O servidor recusou: atualiza a prévia (mostra o bloqueio atual) e mantém o diálogo aberto. */
  private refreshUsage(category: Category, detail: string): void {
    this.api.usage(category.id).subscribe({
      next: (usage) => {
        this.deleting.set({ category, usage });
        this.deleteError.set(usage.canDelete ? detail : null);
      },
      error: () => this.deleteError.set(detail),
    });
  }
}
