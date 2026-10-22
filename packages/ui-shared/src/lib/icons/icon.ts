import { Component, computed, input } from '@angular/core';
import { iconPaths } from './icon-set';

/**
 * Ícone do conjunto do GEFINC. Sem `label` é decorativo (o texto ao lado diz o que é); com `label` vira
 * uma imagem com nome acessível.
 */
@Component({
  selector: 'gef-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
      focusable="false"
    >
      @for (path of paths(); track path.d) {
        <path [attr.d]="path.d" [attr.fill]="path.fill ?? 'none'" />
      }
    </svg>
  `,
  host: { class: 'inline-flex shrink-0 items-center justify-center' },
})
export class Icon {
  readonly name = input.required<string | null | undefined>();
  readonly size = input(20);
  readonly label = input('');

  protected readonly paths = computed(() => iconPaths(this.name()));
}
