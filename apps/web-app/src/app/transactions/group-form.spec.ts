import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API, configureHttpTesting, select, type } from '../../test/testbed';
import { GroupForm } from './group-form';

describe('GroupForm', () => {
  async function setup() {
    const ctx = configureHttpTesting();
    const fixture = TestBed.createComponent(GroupForm);
    fixture.detectChanges();
    ctx.flushReference();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  function fill(el: HTMLElement, fixture: { detectChanges(): void }, account: string) {
    type(el, '#description', 'Mercado');
    select(el, '#accountId', account);
    fixture.detectChanges();
    select(el, '#categoryId', '10');
    type(el, 'gef-money-input input', '15000');
    fixture.detectChanges();
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('mostra só categorias da natureza escolhida', async () => {
    const { el, fixture } = await setup();
    expect(el.querySelector('#categoryId')?.textContent).toContain('Alimentação');
    expect(el.querySelector('#categoryId')?.textContent).not.toContain('Salário');

    select(el, '#kind', 'INCOME');
    fixture.detectChanges();
    expect(el.querySelector('#categoryId')?.textContent).toContain('Salário');
    expect(el.querySelector('#categoryId')?.textContent).not.toContain('Alimentação');
  });

  it('fora do cartão pede o vencimento e o envia', async () => {
    const { http, el, fixture } = await setup();
    fill(el, fixture, '1');
    expect(el.querySelector('#firstDueDate')).not.toBeNull();
    type(el, '#purchaseDate', '2026-11-08');
    type(el, '#firstDueDate', '2026-11-12');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).toEqual({
      description: 'Mercado',
      recurrenceType: 'VARIABLE',
      totalAmount: '150.00',
      accountId: 1,
      categoryId: 10,
      purchaseDate: '2026-11-08',
      firstDueDate: '2026-11-12',
    });
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('no cartão esconde o vencimento, mostra a prévia pela fatura e não envia firstDueDate', async () => {
    const { http, el, fixture } = await setup();
    fill(el, fixture, '2');
    type(el, '#purchaseDate', '2026-11-12'); // após o fechamento (dia 10)
    fixture.detectChanges();

    expect(el.querySelector('#firstDueDate')).toBeNull();
    expect(el.textContent).toContain('Vence em 17/12/2026');

    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne({ method: 'POST', url: `${API}/transaction-groups` });
    expect(post.request.body).not.toHaveProperty('firstDueDate');
    expect(post.request.body.accountId).toBe(2);
    post.flush({}, { status: 201, statusText: 'Created' });
  });

  it('não envia com campos obrigatórios vazios', async () => {
    const { http, el, fixture } = await setup();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    http.expectNone({ method: 'POST', url: `${API}/transaction-groups` });
    expect(el.textContent).toContain('Informe a descrição.');
    expect(el.textContent).toContain('Escolha a conta.');
    expect(el.textContent).toContain('Escolha a categoria.');
  });
});
