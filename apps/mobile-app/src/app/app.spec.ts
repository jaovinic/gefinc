import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it('usa o router-outlet comum: a tela anterior é destruída ao navegar (sem ids duplicados no DOM)', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('ion-app')).not.toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelector('ion-router-outlet')).toBeNull();
  });
});
