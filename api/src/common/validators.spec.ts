import {
  isValidCpf,
  normalizeBrPhone,
  passwordProblems,
  toE164,
} from './validators';
import { escapeLike, normalizeSearch, slugify } from './text';

describe('CPF (US06)', () => {
  it.each(['52998224725', '529.982.247-25', '11144477735', '111.444.777-35'])(
    'aceita CPF válido %s',
    (cpf) => expect(isValidCpf(cpf)).toBe(true),
  );

  it.each([
    ['dígito verificador errado', '52998224724'],
    ['primeiro DV errado', '52998224715'],
    ['sequência repetida', '11111111111'],
    ['sequência repetida com máscara', '000.000.000-00'],
    ['curto', '5299822472'],
    ['longo', '529982247250'],
    ['letras', '5299822472a'],
    ['máscara incompleta', '529.982247-25'],
    ['vazio', ''],
  ])('rejeita CPF %s (%s)', (_label, cpf) =>
    expect(isValidCpf(cpf)).toBe(false),
  );

  it('rejeita tipos que não são texto', () => {
    expect(isValidCpf(52998224725)).toBe(false);
    expect(isValidCpf(null)).toBe(false);
  });
});

describe('Telefone (US06)', () => {
  it.each([
    ['(11) 98765-4321', '11987654321'],
    ['11987654321', '11987654321'],
    ['+55 11 98765-4321', '11987654321'],
    ['(19) 3232-1234', '1932321234'],
  ])('normaliza %s', (input, expected) =>
    expect(normalizeBrPhone(input)).toBe(expected),
  );

  it.each([
    '(01) 98765-4321',
    '(11) 88765-4321',
    '123',
    'abc11987654321',
    '(00) 0000-0000',
  ])('rejeita %s', (input) => expect(normalizeBrPhone(input)).toBeNull());

  it('converte para E.164 para o SMS', () => {
    expect(toE164('11987654321')).toBe('+5511987654321');
    expect(toE164('+5511987654321')).toBe('+5511987654321');
  });
});

describe('Senha forte (US03)', () => {
  it('aceita senha com 8+ caracteres, letra, número e símbolo', () => {
    expect(passwordProblems('Senha@123')).toEqual([]);
    expect(passwordProblems('SENHA#123')).toEqual([]); // só maiúsculas também vale
    expect(passwordProblems('açaí!2024')).toEqual([]);
  });

  it('aponta cada regra que falta', () => {
    expect(passwordProblems('Ab@1')).toContain('mínimo de 8 caracteres');
    expect(passwordProblems('Senhaaaa@')).toContain('ao menos um número');
    expect(passwordProblems('Senha1234')).toContain('ao menos um símbolo');
    expect(passwordProblems('12345678!')).toContain('ao menos uma letra');
  });
});

describe('Texto de busca (US10)', () => {
  it('normaliza acentos e caixa', () => {
    expect(normalizeSearch('Tênis  Calçados AÇÃO')).toBe('tenis calcados acao');
    expect(slugify('Óculos de Sol Polarizado')).toBe(
      'oculos-de-sol-polarizado',
    );
  });

  it('escapa curingas do LIKE', () => {
    expect(escapeLike('100%_off')).toBe('100\\%\\_off');
  });
});
