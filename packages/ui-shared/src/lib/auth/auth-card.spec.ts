import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthCard } from './auth-card';

@Component({
  imports: [AuthCard],
  template: `<gef-auth-card heading="Entrar" [clearToggle]="clear()"><p>conteudo</p></gef-auth-card>`,
})
class Host {
  readonly clear = signal(true);
}

describe('AuthCard', () => {
  function setup() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, wrapper: el.querySelector('gef-auth-card > div') as HTMLElement, toggle: el.querySelector('gef-theme-toggle') as HTMLElement };
  }

  it('o botão de tema rola junto com o conteúdo: absoluto dentro de um contêiner relativo, nunca fixo', () => {
    const { wrapper, toggle } = setup();

    expect(wrapper.className).toContain('relative');
    expect(toggle.className).toContain('absolute');
    expect(toggle.className).not.toContain('fixed');
    expect(toggle.parentElement).toBe(wrapper);
  });

  it('reserva espaço no topo por padrão (o botão de tema não cobre o cartão) e deixa desligar com clearToggle=false', () => {
    const { fixture, wrapper } = setup();
    expect(wrapper.className).toContain('relative');
    expect(wrapper.className).toContain('pt-[calc(env(safe-area-inset-top)+4.5rem)]');
    expect(wrapper.className).toContain('sm:pt-4');

    fixture.componentInstance.clear.set(false);
    fixture.detectChanges();

    expect(wrapper.className).toContain('relative');
    expect(wrapper.className).not.toContain('pt-[calc(env(safe-area-inset-top)+4.5rem)]');
  });

  it('sem o atributo clearToggle o padrão também reserva o espaço', () => {
    TestBed.resetTestingModule();
    TestBed.overrideComponent(Host, { set: { template: '<gef-auth-card heading="Entrar"><p>x</p></gef-auth-card>' } });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('gef-auth-card > div')?.className).toContain('pt-[calc(env(safe-area-inset-top)+4.5rem)]');
  });
});
