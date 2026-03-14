import { useState, useEffect, useCallback } from 'react';
import { getToken, setToken, clearToken, verifyAuth } from './adminApi';

interface UseAdminAuth {
  authenticated: boolean;
  checking: boolean;
  login: (secret: string) => Promise<boolean>;
  logout: () => void;
}

export function useAdminAuth(): UseAdminAuth {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      return;
    }
    verifyAuth().then(valid => {
      setAuthenticated(valid);
      if (!valid) clearToken();
      setChecking(false);
    });
  }, []);

  const login = useCallback(async (secret: string): Promise<boolean> => {
    setToken(secret);
    const valid = await verifyAuth();
    if (valid) {
      setAuthenticated(true);
      return true;
    }
    clearToken();
    return false;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuthenticated(false);
  }, []);

  return { authenticated, checking, login, logout };
}
