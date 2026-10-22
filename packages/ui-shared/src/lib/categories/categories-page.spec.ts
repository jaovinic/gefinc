import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, CATEGORIES, clickButton, configureHttpTesting, type } from '../../testing/testbed';
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
    clickButton(el, 'Nova categoria');
    fixture.detectChanges();
    type(el, '#name', 'Pets');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const post = http.expectOne({ method: 'POST', url: `${API}/categories` });
    expect(post.request.body).toMatchObject({ name: 'Pets', type: 'EXPENSE' });
    post.flush({ id: 30, name: 'Pets', type: 'EXPENSE', colorHex: '#94a3b8' }, { status: 201, statusText: 'Created' });
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
    http.expectOne((r) => r.url === `${API}/accounts`).flush([]);
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
  });

  it('categoria em uso pede a categoria que receberá os lançamentos e exclui com reatribuição', async () => {
    const { http, el, fixture } = await setup();
    // exclui "Alimentação": o servidor responde que está em uso
    const first = Array.from(el.querySelectorAll('li')).find((li) => li.textContent?.includes('Alimentação')) as HTMLElement;
    (Array.from(first.querySelectorAll('button')).find((b) => b.textContent === 'Excluir') as HTMLButtonElement).click();
    http.expectOne({ method: 'DELETE', url: `${API}/categories/10` }).flush({ code: 'CATEGORY_IN_USE' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('possui lançamentos');
    const select = el.querySelector('[role="alert"] select') as HTMLSelectElement;
    select.value = '11';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    clickButton(el, 'Mover e excluir');

    const del = http.expectOne((r) => r.method === 'DELETE' && r.url === `${API}/categories/10`);
    expect(del.request.params.get('reassignTo')).toBe('11');
    del.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
    http.expectOne((r) => r.url === `${API}/accounts`).flush([]);
    http.expectOne((r) => r.method === 'GET' && r.url === `${API}/categories`).flush(CATEGORIES);
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
