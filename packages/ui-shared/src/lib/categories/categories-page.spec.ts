import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NoticeService } from '../api';
import { API, CATEGORIES, clickButton, configureHttpTesting, selectTrigger, type } from '../../testing/testbed';
import { CategoriesPage } from './categories-page';

describe('CategoriesPage', () => {
  async function setup() {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    ctx.expectGet('/categories').flush(CATEGORIES);
    // a tela atualiza os dados de referência depois de carregar
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('agrupa por despesas e receitas com a cor de cada categoria', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('Despesas');
    expect(el.textContent).toContain('Receitas');
    expect(el.textContent).toContain('Alimentação');
    expect(el.textContent).toContain('Salário');
  });

  it('cria uma categoria', async () => {
    const { http, el, fixture } = await setup();
    const notices = TestBed.inject(NoticeService);
    clickButton(el, 'Nova categoria');
    fixture.detectChanges();
    expect(el.querySelector('gef-sheet [role="dialog"][aria-label="Nova categoria"]')).not.toBeNull();
    type(el, '#name', 'Pets');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const post = http.expectOne({ method: 'POST', url: `${API}/categories` });
    expect(post.request.body).toMatchObject({ name: 'Pets', type: 'EXPENSE' });
    post.flush({ id: 30, name: 'Pets', type: 'EXPENSE', colorHex: '#94a3b8' }, { status: 201, statusText: 'Created' });
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
    http.expectOne((r) => r.url === `${API}/accounts`).flush([]);
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
    fixture.detectChanges();
    expect(el.querySelector('gef-sheet [role="dialog"]')).toBeNull();
    expect(notices.toasts().some((t) => t.message === 'Categoria criada.')).toBe(true);
  });

  it('a cor se escolhe numa paleta (sem seletor do sistema) e vai no corpo da criação', async () => {
    const { http, el, fixture } = await setup();
    clickButton(el, 'Nova categoria');
    fixture.detectChanges();
    expect(el.querySelector('input[type="color"]')).toBeNull();
    expect(el.querySelector('gef-sheet [role="radiogroup"][aria-label="Cor"]')).not.toBeNull();
    type(el, '#name', 'Pets');
    (el.querySelector('[role="radio"][data-color="#16A34A"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const post = http.expectOne({ method: 'POST', url: `${API}/categories` });
    expect(post.request.body).toMatchObject({ name: 'Pets', colorHex: '#16A34A' });
    post.flush({ id: 30, name: 'Pets', type: 'EXPENSE', colorHex: '#16A34A' }, { status: 201, statusText: 'Created' });
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
    http.expectOne((r) => r.url === `${API}/accounts`).flush([]);
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
  });

  it('editar uma categoria com cor fora da paleta mostra "Cor atual" marcada e preserva a cor ao salvar', async () => {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.detectChanges();
    const custom = { id: 40, name: 'Pets', type: 'EXPENSE', colorHex: '#123ABC' };
    ctx.expectGet('/categories').flush([custom]);
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('button[aria-label="Editar Pets"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const checked = Array.from(el.querySelectorAll('[role="radio"]')).filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0].getAttribute('aria-label')).toBe('Cor atual (#123ABC)');

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const put = ctx.http.expectOne({ method: 'PUT', url: `${API}/categories/40` });
    expect(put.request.body).toMatchObject({ colorHex: '#123ABC' });
    put.flush(custom);
    ctx.http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush([custom]);
    ctx.http.expectOne((r) => r.url === `${API}/accounts`).flush([]);
    ctx.http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush([custom]);
  });

  it('editar abre o modal com o título Editar categoria, pré-carrega os dados, desabilita tipo com aviso, atualiza e avisa', async () => {
    const { http, el, fixture } = await setup();
    const notices = TestBed.inject(NoticeService);

    (el.querySelector('button[aria-label="Editar Alimentação"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const sheet = el.querySelector('gef-sheet [role="dialog"][aria-label="Editar categoria"]');
    expect(sheet).not.toBeNull();
    expect(sheet?.textContent).toContain('O tipo não pode ser alterado após a criação.');

    const nameInput = el.querySelector('#name') as HTMLInputElement;
    expect(nameInput.value).toBe('Alimentação');

    const typeSelect = selectTrigger(el, 'Tipo');
    expect(typeSelect.textContent).toContain('Despesas');
    expect(typeSelect.disabled).toBe(true);

    type(el, '#name', 'Supermercado');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const put = http.expectOne({ method: 'PUT', url: `${API}/categories/10` });
    expect(put.request.body).toMatchObject({ name: 'Supermercado', type: 'EXPENSE' });
    put.flush({ id: 10, name: 'Supermercado', type: 'EXPENSE', colorHex: '#94a3b8' });

    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
    http.expectOne((r) => r.url === `${API}/accounts`).flush([]);
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);

    fixture.detectChanges();
    expect(el.querySelector('gef-sheet [role="dialog"]')).toBeNull();
    expect(notices.toasts().some((t) => t.message === 'Categoria atualizada.')).toBe(true);
  });

  describe('excluir categoria (confirmação e guarda de integridade)', () => {
    const free = { canDelete: true, transactionCount: 0, groupCount: 0 };
    const used = { canDelete: false, transactionCount: 8, groupCount: 3 };
    const dialog = (el: HTMLElement) => el.querySelector('[role="alertdialog"]') as HTMLElement | null;
    const confirmButton = (el: HTMLElement) => el.querySelector('[data-testid="confirm-confirm"]') as HTMLButtonElement;
    const reload = (http: HttpTestingController) => {
      http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
      http.expectOne((r) => r.url === `${API}/accounts`).flush([]);
      http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
    };

    async function open(prepared: object) {
      const ctx = await setup();
      const row = Array.from(ctx.el.querySelectorAll('li')).find((li) => li.textContent?.includes('Alimentação')) as HTMLElement;
      (Array.from(row.querySelectorAll('button')).find((b) => b.textContent === 'Excluir') as HTMLButtonElement).click();
      ctx.http.expectOne({ method: 'GET', url: `${API}/categories/10/usage` }).flush(prepared);
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('Excluir só consulta o uso e abre a confirmação, sem excluir', async () => {
      const { http, el, fixture } = await open(free);
      http.expectNone({ method: 'DELETE', url: `${API}/categories/10` });
      expect(dialog(el)?.textContent).toContain('A categoria "Alimentação" será excluída definitivamente. Esta ação não pode ser desfeita.');
      expect(confirmButton(el).textContent?.trim()).toBe('Excluir categoria "Alimentação"');
      expect(document.activeElement).toBe(el.querySelector('[data-testid="confirm-cancel"]'));

      (el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
      http.expectNone({ method: 'DELETE', url: `${API}/categories/10` });
    });

    it('confirmar exclui sem reatribuição, recarrega e avisa; o duplo toque envia uma só exclusão', async () => {
      const { http, el, fixture } = await open(free);
      const notices = TestBed.inject(NoticeService);
      confirmButton(el).click();
      confirmButton(el).click();
      const del = http.expectOne({ method: 'DELETE', url: `${API}/categories/10` });
      expect(del.request.params.keys()).toEqual([]);
      del.flush(null, { status: 204, statusText: 'No Content' });
      reload(http);
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
      expect(notices.toasts()[0].message).toBe('Categoria excluída.');
    });

    it('categoria em uso mostra o bloqueio com a contagem, só Fechar e nenhum "Mover e excluir"', async () => {
      const { http, el, fixture } = await open(used);
      expect(dialog(el)?.textContent).toContain('A categoria "Alimentação" está em uso em 8 lançamentos. Altere a categoria desses lançamentos e tente novamente.');
      expect(confirmButton(el)).toBeNull();
      expect(el.textContent).not.toContain('Mover e excluir');
      expect(el.querySelector('select')).toBeNull();
      expect(el.querySelector('[data-testid="confirm-cancel"]')?.textContent?.trim()).toBe('Fechar');

      (el.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
      http.expectNone({ method: 'DELETE', url: `${API}/categories/10` });
    });

    it('409 ao confirmar mantém o diálogo aberto e atualiza a prévia', async () => {
      const { http, el, fixture } = await open(free);
      confirmButton(el).click();
      http.expectOne({ method: 'DELETE', url: `${API}/categories/10` }).flush({ code: 'CATEGORY_IN_USE', detail: 'Em uso.' }, { status: 409, statusText: 'Conflict' });
      http.expectOne({ method: 'GET', url: `${API}/categories/10/usage` }).flush(used);
      fixture.detectChanges();
      expect(dialog(el)).not.toBeNull();
      expect(el.querySelector('[data-testid="confirm-blocked"]')?.textContent).toContain('está em uso em 8 lançamentos');
      expect(confirmButton(el)).toBeNull();
    });

    it('404 ao excluir trata como já excluída e recarrega', async () => {
      const { http, el, fixture } = await open(free);
      confirmButton(el).click();
      http.expectOne({ method: 'DELETE', url: `${API}/categories/10` }).flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
      reload(http);
      fixture.detectChanges();
      expect(dialog(el)).toBeNull();
    });

    it('outro erro aparece dentro do diálogo, que continua aberto', async () => {
      const { http, el, fixture } = await open(free);
      confirmButton(el).click();
      http.expectOne({ method: 'DELETE', url: `${API}/categories/10` }).flush({}, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(dialog(el)).not.toBeNull();
      expect(el.querySelector('[data-testid="confirm-error"]')?.textContent).toContain('erro inesperado');
    });
  });

  it('as ações de cada categoria têm rótulo acessível com o nome e área de toque confortável', async () => {
    const { el } = await setup();
    for (const label of ['Editar Alimentação', 'Excluir Alimentação', 'Editar Salário']) {
      const button = el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(button.className).toContain('gef-btn-sm');
    }
  });
});
