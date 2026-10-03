export interface IntegerInputOptions {
  min?: number;
  max?: number;
  maxDigits?: number;
  allowNegative?: boolean;
}

/** Gives integer text fields the same mobile editing behavior: select, sanitize, apply, Done. */
export function mountIntegerInput(
  input: HTMLInputElement,
  setValue: (value: number) => void,
  options: IntegerInputOptions = {},
): void {
  const min = options.min ?? (input.min === '' ? undefined : Number(input.min));
  const max = options.max ?? (input.max === '' ? undefined : Number(input.max));
  const maxDigits = options.maxDigits ?? (input.maxLength > 0 ? input.maxLength : undefined);

  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => {
    let value = options.allowNegative
      ? input.value.replace(/[^\d-]/g, '')
      : input.value.replace(/\D/g, '');
    if (options.allowNegative) {
      const isNegative = value.startsWith('-');
      value = `${isNegative ? '-' : ''}${value.replace(/-/g, '')}`;
    }
    if (maxDigits !== undefined) {
      const isNegative = options.allowNegative && value.startsWith('-');
      const digits = value.replace(/-/g, '').slice(0, maxDigits);
      value = `${isNegative ? '-' : ''}${digits}`;
    }
    if (input.value !== value) input.value = value;
    if (value === '' || value === '-') return;

    let number = Number(value);
    if (min !== undefined) number = Math.max(min, number);
    if (max !== undefined) number = Math.min(max, number);
    if (input.value !== String(number)) input.value = String(number);
    setValue(number);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    input.blur();
  });
}
