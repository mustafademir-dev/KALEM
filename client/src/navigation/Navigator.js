/**
 * Minimal Uygulama İçi Navigasyon
 *
 * `@react-navigation` gibi bir kütüphane eklemeye gerek görülmedi — tek
 * ekran-yığını (stack), gesture/deep-link ihtiyacı olmayan bir demo
 * uygulaması için basit bir context tabanlı yığın yeterli. PaymentScreen
 * zaten kendi içinde aynı deseni (local state machine) kullanıyordu; bu
 * dosya AYNI deseni uygulama geneline taşır.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NavigationContext = createContext(null);

export function NavigationProvider({ initialRoute, children }) {
  const [stack, setStack] = useState([initialRoute]);

  const navigate = useCallback((name, params) => {
    setStack((s) => [...s, { name, params }]);
  }, []);

  const replace = useCallback((name, params) => {
    setStack((s) => [...s.slice(0, -1), { name, params }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const reset = useCallback((name, params) => {
    setStack([{ name, params }]);
  }, []);

  const current = stack[stack.length - 1];

  const value = useMemo(
    () => ({ current, navigate, replace, goBack, reset, canGoBack: stack.length > 1 }),
    [current, navigate, replace, goBack, reset, stack.length]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation, NavigationProvider içinde kullanılmalı.');
  return ctx;
}
