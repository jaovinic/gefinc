import { Component, input } from '@angular/core';
import { Icon } from '../../icons/icon';

/**
 * Avatar circular com o gradiente Aurora e a inicial; sem inicial mostra o ícone de usuário. É
 * decorativo: o nome de quem é fica no texto ao lado.
 */
@Component({
  selector: 'gef-avatar',
  imports: [Icon],
  template: `
    <span class="gef-avatar" [class.gef-avatar-lg]="size() === 'lg'" aria-hidden="true">
      @if (initial(); as letter) {
        {{ letter }}
      } @else {
        <gef-icon name="user" [size]="size() === 'lg' ? 28 : 18" />
      }
    </span>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Avatar {
  readonly initial = input<string | null | undefined>(null);
  readonly size = input<'md' | 'lg'>('md');
}
