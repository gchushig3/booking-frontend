import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validateEcuadorianId(value: string): Promise<ValidationResult> {
  return Promise.resolve().then(() => {
    if (!/^\d{10}$/.test(value)) return { valid: false, message: 'Ingresa 10 dígitos.' };
    const province = Number(value.slice(0, 2));
    const thirdDigit = Number(value[2]);
    if (!((province >= 1 && province <= 24) || province === 30) || thirdDigit >= 6) {
      return { valid: false, message: 'La cédula no tiene un código provincial válido.' };
    }

    const sum = value.slice(0, 9).split('').reduce((total, char, index) => {
      if (index % 2 !== 0) return total + Number(char);
      const product = Number(char) * 2;
      return total + (product > 9 ? product - 9 : product);
    }, 0);
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === Number(value[9])
      ? { valid: true }
      : { valid: false, message: 'El dígito verificador no coincide.' };
  });
}

export function validateCreditCard(value: string): Promise<ValidationResult> {
  return Promise.resolve().then(() => {
    if (!/^\d{13,19}$/.test(value)) return { valid: false, message: 'Ingresa entre 13 y 19 dígitos.' };
    let sum = 0;
    let doubleDigit = false;
    for (let index = value.length - 1; index >= 0; index--) {
      let digit = Number(value[index]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0
      ? { valid: true }
      : { valid: false, message: 'El número de tarjeta no supera la validación Luhn.' };
  });
}

export function ecuadorianIdAsyncValidator(): AsyncValidatorFn {
  return async (control: AbstractControl): Promise<ValidationErrors | null> => {
    const result = await validateEcuadorianId(String(control.value ?? ''));
    return result.valid ? null : { cedulaInvalida: result.message ?? true };
  };
}

export function creditCardAsyncValidator(): AsyncValidatorFn {
  return async (control: AbstractControl): Promise<ValidationErrors | null> => {
    const result = await validateCreditCard(String(control.value ?? ''));
    return result.valid ? null : { tarjetaInvalida: result.message ?? true };
  };
}
