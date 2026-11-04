import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { isoToBR } from '@gefinc/utils';
import { provideRouter } from '@angular/router';
import { API_BASE_URL, CLIENT_KIND, MemoryTokenStore, TokenStore, authInterceptor } from '@gefinc/ui-shared';

export const API = 'http://api.test/api/v1';

export const ACCOUNTS = [
  { id: 1, name: 'Itaú', type: 'CHECKING', holderType: 'PF', icon: 'bank', active: true, version: 0 },
  {
    id: 2, name: 'Nubank', type: 'CREDIT_CARD', closingDay: 10, dueDay: 17, holderType: 'PF', icon: 'card',
    bankAccountId: 1, bankAccountName: 'Itaú', active: true, version: 0,
  },
];
export const CATEGORIES = [
  { id: 10, name: 'Alimentação', type: 'EXPENSE', colorHex: '#F97316' },
  { id: 11, name: 'Outras despesas', type: 'EXPENSE', colorHex: '#94A3B8' },
  { id: 20, name: 'Salário', type: 'INCOME', colorHex: '#00E599' },
];

export function configureMobileTesting(extra: Provider[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: API },
      { provide: CLIENT_KIND, useValue: 'mobile' },
      { provide: TokenStore, useClass: MemoryTokenStore },
      ...extra,
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  return {
    http,
    flushReference() {
      http.expectOne((r) => r.url === `${API}/accounts`).flush(ACCOUNTS);
      http.expectOne((r) => r.url === `${API}/categories`).flush(CATEGORIES);
    },
  };
}

export function type(root: HTMLElement, selector: string, value: string) {
  const input = root.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/**
 * Escolhe uma opção num `gef-select` pelo rótulo do campo (rótulo visível ou `ariaLabel`): abre a lista e clica
 * na opção pelo texto exato.
 */
export function pickOption(fixture: { detectChanges(): void; nativeElement: HTMLElement }, label: string, optionText: string) {
  const field = Array.from(fixture.nativeElement.querySelectorAll('gef-select')).find(
    (el) => el.querySelector('label, span.sr-only')?.textContent?.trim() === label,
  );
  if (!field) {
    throw new Error(`Campo de escolha "${label}" não encontrado`);
  }
  (field.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
  fixture.detectChanges();
  const option = Array.from(field.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.textContent?.trim() === optionText);
  if (!option) {
    throw new Error(`Opção "${optionText}" não encontrada em "${label}"`);
  }
  option.click();
  fixture.detectChanges();
}

/** Preenche um campo de data (`gef-date-field`) com uma data ISO: digita os dígitos de dd/mm/aaaa, como o usuário. */
export function fillDate(root: HTMLElement, selector: string, iso: string) {
  type(root, selector, isoToBR(iso).replace(/\D/g, ''));
}

/** Escolhe uma conta ou cartão no seletor com ícones. */
export function chooseAccount(fixture: { detectChanges(): void }, root: HTMLElement, accountId: number | string) {
  (root.querySelector('gef-account-picker button[aria-haspopup]') as HTMLButtonElement).click();
  fixture.detectChanges();
  (document.querySelector(`[role="option"][data-account-id="${accountId}"]`) as HTMLElement).click();
  fixture.detectChanges();
}

/** Botão de um `gef-select` pelo rótulo do campo (para ler o valor mostrado ou o estado desabilitado). */
export function selectTrigger(root: HTMLElement, label: string): HTMLButtonElement {
  const field = Array.from(root.querySelectorAll('gef-select')).find(
    (el) => el.querySelector('label, span.sr-only')?.textContent?.trim() === label,
  );
  if (!field) {
    throw new Error(`Campo de escolha "${label}" não encontrado`);
  }
  return field.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
}

/** Textos das opções de um `gef-select` (abre a lista, lê e fecha com Escape). */
export function optionLabels(fixture: { detectChanges(): void; nativeElement: HTMLElement }, label: string): string[] {
  const field = Array.from(fixture.nativeElement.querySelectorAll('gef-select')).find(
    (el) => el.querySelector('label, span.sr-only')?.textContent?.trim() === label,
  );
  if (!field) {
    throw new Error(`Campo de escolha "${label}" não encontrado`);
  }
  (field.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click();
  fixture.detectChanges();
  const texts = Array.from(field.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim() ?? '');
  field.querySelector('[role="listbox"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  fixture.detectChanges();
  return texts;
}
