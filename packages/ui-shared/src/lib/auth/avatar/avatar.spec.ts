import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

@Component({
  imports: [Avatar],
  template: `<gef-avatar [initial]="initial" [size]="size" />`,
})
class Host {
  initial: string | null = 'A';
  size: 'md' | 'lg' = 'md';
}

describe('Avatar', () => {
  function setup(initial: string | null, size: 'md' | 'lg' = 'md') {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.initial = initial;
    fixture.componentInstance.size = size;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { el, circle: el.querySelector('span[aria-hidden="true"]') as HTMLElement };
  }

  it('mostra a inicial num círculo decorativo, sem esconder o host', () => {
    const { el, circle } = setup('A');
    expect(circle.textContent?.trim()).toBe('A');
    expect(circle.classList.contains('gef-avatar')).toBe(true);
    expect(circle.classList.contains('gef-avatar-lg')).toBe(false);
    expect(el.querySelector('gef-avatar')?.hasAttribute('aria-hidden')).toBe(false);
    expect(circle.querySelector('svg')).toBeNull();
  });

  it('o tamanho grande usa a classe do avatar grande', () => {
    const { circle } = setup('B', 'lg');
    expect(circle.classList.contains('gef-avatar-lg')).toBe(true);
  });

  it.each([null, ''])('sem inicial (%p) mostra o ícone de usuário', (initial) => {
    const { circle } = setup(initial);
    expect(circle.querySelector('svg')).not.toBeNull();
    expect(circle.textContent?.trim()).toBe('');
  });
});
