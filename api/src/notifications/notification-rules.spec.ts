import {
  DEFAULT_PREFERENCES,
  isAllowed,
  Preferences,
} from './notification-rules';

describe('Envio condicional (US08)', () => {
  const all: Preferences = {
    emailEnabled: true,
    pushEnabled: true,
    smsEnabled: true,
    promotionsEnabled: true,
    ordersEnabled: true,
  };

  it('envia só quando canal E categoria estão ligados', () => {
    expect(isAllowed(all, 'ORDERS', 'EMAIL')).toBe(true);
    expect(isAllowed({ ...all, emailEnabled: false }, 'ORDERS', 'EMAIL')).toBe(
      false,
    );
    expect(isAllowed({ ...all, ordersEnabled: false }, 'ORDERS', 'EMAIL')).toBe(
      false,
    );
  });

  it('canais são independentes entre si', () => {
    const prefs = { ...all, smsEnabled: false };
    expect(isAllowed(prefs, 'ORDERS', 'SMS')).toBe(false);
    expect(isAllowed(prefs, 'ORDERS', 'EMAIL')).toBe(true);
    expect(isAllowed(prefs, 'ORDERS', 'PUSH')).toBe(true);
  });

  it('categorias são independentes entre si', () => {
    const prefs = { ...all, promotionsEnabled: false };
    expect(isAllowed(prefs, 'PROMOTIONS', 'EMAIL')).toBe(false);
    expect(isAllowed(prefs, 'ORDERS', 'EMAIL')).toBe(true);
  });

  it('padrão: pedidos sim, promoções não (opt-in), SMS desligado', () => {
    expect(isAllowed(DEFAULT_PREFERENCES, 'ORDERS', 'EMAIL')).toBe(true);
    expect(isAllowed(DEFAULT_PREFERENCES, 'PROMOTIONS', 'EMAIL')).toBe(false);
    expect(isAllowed(DEFAULT_PREFERENCES, 'ORDERS', 'SMS')).toBe(false);
  });
});
