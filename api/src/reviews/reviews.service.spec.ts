import { publicAuthorName, weightedAverage } from './reviews.service';

describe('Avaliações (US12) — cálculos', () => {
  it('média ponderada pela distribuição de estrelas', () => {
    expect(
      weightedAverage([
        { rating: 5, count: 3 },
        { rating: 2, count: 1 },
      ]),
    ).toEqual({ average: 4.3, count: 4 }); // (15 + 2) / 4 = 4.25 -> 4.3
    expect(weightedAverage([])).toEqual({ average: 0, count: 0 });
  });

  it('nome público mostra só primeiro nome e inicial', () => {
    expect(publicAuthorName('Gabriel Magnabosco Camargo')).toBe('Gabriel C.');
    expect(publicAuthorName('Ana')).toBe('Ana');
    expect(publicAuthorName(null)).toBe('Cliente');
    expect(publicAuthorName('   ')).toBe('Cliente');
  });
});
