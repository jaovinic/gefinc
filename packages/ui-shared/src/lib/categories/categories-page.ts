import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CATEGORY_TYPES, ERROR_CODES, type Category, type CategoryType } from '@gefinc/core-models';
import { CategoriesApi, ReferenceData, messageFor, toProblem } from '../api';
import { EmptyView, ErrorView, LoadingView } from '../state-views/state-views';

const TYPE_LABELS: Record<CategoryType, string> = { EXPENSE: 'Despesas', INCOME: 'Receitas' };

/** Categorias de receita e de despesa; excluir uma categoria em uso exige escolher a que recebe os lançamentos. */
@Component({
  selector: 'gef-categories-page',
  imports: [ReactiveFormsModule, EmptyView, ErrorView, LoadingView],
  template: `
    <section class="space-y-6">
      <header class="flex items-center justify-between">
        <h1 class="text-title-lg font-bold">Categorias</h1>
        <button type="button" class="gef-btn-secondary" (click)="startCreate()">Nova categoria</button>
      </header>

      @if (message(); as text) {
        <p class="gef-alert-error" role="alert">{{ text }}</p>
      }

      @if (formOpen()) {
        <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-4 rounded-xl border border-gefinc-border bg-gefinc-surface p-4 sm:grid-cols-4" novalidate>
          <div class="sm:col-span-2">
            <label class="gef-label" for="name">Nome</label>
            <input id="name" class="gef-input" formControlName="name" maxlength="60" />
            @if (form.controls.name.touched && form.controls.name.invalid) {
              <p class="gef-field-error">Informe o nome.</p>
            }
          </div>
          <div>
            <label class="gef-label" for="type">Tipo</label>
            <select id="type" class="gef-input" formControlName="type">
              @for (type of types; track type) {
                <option [value]="type">{{ labels[type] }}</option>
              }
            </select>
          </div>
          <div>
            <label class="gef-label" for="colorHex">Cor</label>
            <input id="colorHex" class="gef-input h-10 p-1" type="color" formControlName="colorHex" />
          </div>
          <div class="flex gap-3 sm:col-span-4">
            <button type="submit" class="gef-btn-primary max-w-40" [disabled]="busy()">Salvar</button>
            <button type="button" class="gef-btn-secondary" (click)="closeForm()">Cancelar</button>
          </div>
        </form>
      }

      @if (reassigning(); as pending) {
        <div class="gef-alert-warning space-y-3" role="alert">
          <p>
            A categoria "{{ pending.name }}" possui lançamentos. Escolha a categoria que vai recebê-los:
          </p>
          <div class="flex items-center gap-3">
            <select class="gef-input max-w-xs" [value]="reassignTarget()" (change)="reassignTarget.set(+$any($event.target).value)">
              <option value="0">Selecione…</option>
              @for (option of sameType(pending); track option.id) {
                <option [value]="option.id">{{ option.name }}</option>
              }
            </select>
            <button type="button" class="gef-btn-secondary" [disabled]="reassignTarget() === 0" (click)="confirmReassign(pending)">
              Mover e excluir
            </button>
            <button type="button" class="gef-btn-secondary" (click)="reassigning.set(null)">Cancelar</button>
          </div>
        </div>
      }

      @if (loading()) {
        <gef-loading message="Carregando categorias…" />
      } @else if (loadError()) {
        <gef-error [message]="loadError()!" (retry)="load()" />
      } @else if (categories().length === 0) {
        <gef-empty title="Nenhuma categoria" hint="Crie categorias para classificar receitas e despesas." />
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
                  <span class="space-x-3">
                    <button type="button" class="gef-link gef-action" [attr.aria-label]="'Editar ' + category.name" (click)="startEdit(category)">Editar</button>
                    <button type="button" class="gef-action text-gefinc-danger hover:underline" [attr.aria-label]="'Excluir ' + category.name" (click)="remove(category)">Excluir</button>
                  </span>
                </li>
              }
            </ul>
          </div>
        }
      }
    </section>
  `,
})
export class CategoriesPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CategoriesApi);
  private readonly reference = inject(ReferenceData);

  protected readonly types = CATEGORY_TYPES;
  protected readonly labels = TYPE_LABELS;
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly editing = signal<Category | null>(null);
  protected readonly reassigning = signal<Category | null>(null);
  protected readonly reassignTarget = signal(0);

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
        this.loading.set(false);
        this.reference.refresh();
      },
      error: (e: unknown) => {
        this.loadError.set(messageFor(toProblem(e)));
        this.loading.set(false);
      },
    });
  }

  protected byType(type: CategoryType): Category[] {
    return this.categories().filter((c) => c.type === type);
  }

  protected sameType(category: Category): Category[] {
    return this.categories().filter((c) => c.type === category.type && c.id !== category.id);
  }

  protected startCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', type: 'EXPENSE', colorHex: '#94a3b8' });
    this.form.controls.type.enable();
    this.formOpen.set(true);
  }

  protected startEdit(category: Category): void {
    this.editing.set(category);
    this.form.reset({ name: category.name, type: category.type, colorHex: category.colorHex });
    this.form.controls.type.disable();
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const editing = this.editing();
    this.message.set(null);
    this.busy.set(true);
    const request = editing ? this.api.update(editing.id, value) : this.api.create(value);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.closeForm();
        this.load();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.message.set(messageFor(toProblem(e)));
      },
    });
  }

  protected remove(category: Category): void {
    this.message.set(null);
    this.api.remove(category.id).subscribe({
      next: () => this.load(),
      error: (e: unknown) => {
        const problem = toProblem(e);
        if (problem.code === ERROR_CODES.categoryInUse) {
          this.reassignTarget.set(0);
          this.reassigning.set(category);
        } else {
          this.message.set(messageFor(problem));
        }
      },
    });
  }

  protected confirmReassign(category: Category): void {
    this.api.remove(category.id, this.reassignTarget()).subscribe({
      next: () => {
        this.reassigning.set(null);
        this.load();
      },
      error: (e: unknown) => this.message.set(messageFor(toProblem(e))),
    });
  }
}
