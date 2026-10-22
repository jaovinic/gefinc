import { AbstractControl, ValidationErrors } from '@angular/forms';
import { passwordViolation } from '@gefinc/utils';

/** Validador de formulário com a mesma política de senha do servidor. */
export function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  const violation = passwordViolation(control.value as string | null);
  return violation ? { passwordPolicy: violation } : null;
}
