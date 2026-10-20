import { registerDecorator, ValidationOptions } from 'class-validator';

/** Remove tudo que não for dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Valida CPF pelos dígitos verificadores (módulo 11).
 * Aceita "52998224725" ou "529.982.247-25". Rejeita sequências repetidas.
 */
export function isValidCpf(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  // Só dígitos ou a máscara completa; nada de letras ou separadores soltos.
  if (
    !/^\d{11}$/.test(trimmed) &&
    !/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(trimmed)
  ) {
    return false;
  }
  const cpf = onlyDigits(trimmed);
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(cpf[i]) * (len + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/**
 * Telefone brasileiro: DDD válido (11–99) + 8 dígitos (fixo) ou 9 dígitos começando com 9 (celular).
 * Aceita máscara "(11) 98765-4321" e prefixo +55.
 */
export function normalizeBrPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!/^[\d\s()+\-.]+$/.test(raw.trim())) return null;
  let digits = onlyDigits(raw);
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith('55')
  ) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || digits[0] === '0' || digits[1] === '0') return null;
  if (digits.length === 11 && digits[2] !== '9') return null;
  return digits;
}

/** Converte telefone salvo (só dígitos) em E.164 para o provedor de SMS. */
export function toE164(phone: string): string {
  if (phone.startsWith('+')) return phone;
  const normalized = normalizeBrPhone(phone);
  return normalized ? `+55${normalized}` : phone;
}

/**
 * Regra de senha forte da US03: mínimo 8 caracteres, ao menos uma letra,
 * um número e um símbolo (qualquer caractere que não seja letra nem número).
 * O app Flutter usa exatamente a mesma regra.
 */
export function passwordProblems(value: unknown): string[] {
  if (typeof value !== 'string') return ['Senha obrigatória'];
  const problems: string[] = [];
  if (value.length < 8) problems.push('mínimo de 8 caracteres');
  if (value.length > 128) problems.push('máximo de 128 caracteres');
  if (!/\p{L}/u.test(value)) problems.push('ao menos uma letra');
  if (!/\p{N}/u.test(value)) problems.push('ao menos um número');
  if (!/[^\p{L}\p{N}]/u.test(value)) problems.push('ao menos um símbolo');
  return problems;
}

export function IsCpf(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: { message: 'CPF inválido', ...options },
      validator: { validate: (value: unknown) => isValidCpf(value) },
    });
}

export function IsBrPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isBrPhone',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Telefone inválido: informe DDD + número, ex. (11) 98765-4321',
        ...options,
      },
      validator: {
        validate: (value: unknown) => normalizeBrPhone(value) !== null,
      },
    });
}

export function IsStrongPasswordFs(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isStrongPasswordFs',
      target: object.constructor,
      propertyName,
      options: {
        message: (args) =>
          `Senha fraca: ${passwordProblems(args.value).join(', ')}`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => passwordProblems(value).length === 0,
      },
    });
}
