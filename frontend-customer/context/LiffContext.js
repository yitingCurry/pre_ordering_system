import { createContext, useContext, useEffect, useState } from 'react';
import { initLiffApp, hasLiffConfig } from '../lib/liff';

const LiffContext = createContext({
  liffReady: false,
  inClient: false,
  lineUserId: null,
  friendship: null,
  liffError: null,
  hasLiff: false
});

export function LiffProvider({ children }) {
  const [state, setState] = useState({
    liffReady: false,
    inClient: false,
    lineUserId: null,
    friendship: null,
    liffError: null,
    hasLiff: hasLiffConfig()
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await initLiffApp();
      if (cancelled || result.pendingLogin) return;
      setState({
        liffReady: result.ready !== false,
        inClient: result.inClient,
        lineUserId: result.lineUserId,
        friendship: result.friendship,
        liffError: result.error,
        hasLiff: hasLiffConfig()
      });
    })();
    return () => { cancelled = true; };
  }, []);

  return <LiffContext.Provider value={state}>{children}</LiffContext.Provider>;
}

export function useLiff() {
  return useContext(LiffContext);
}
