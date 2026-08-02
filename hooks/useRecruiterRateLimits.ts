import { useCallback, useEffect, useState } from 'react';
import {
  CompanyRateLimitStatus,
  loadCompanyRateLimitStatus,
  subscribeCompanyRateLimits,
} from '../services/rateLimitService';

export const useCompanyRateLimits = () => {
  const [status, setStatus] = useState<CompanyRateLimitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await loadCompanyRateLimitStatus();
      setStatus(nextStatus);
      return nextStatus;
    } catch (loadError) {
      console.error('Unable to load company rate limits:', loadError);
      setError('Unable to verify the company rate limit. Please try again.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stop = subscribeCompanyRateLimits(
      (next) => {
        setStatus(next);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        console.error('Unable to watch company rate limits:', snapshotError);
        setError('Unable to verify the company rate limit. Please try again.');
        setLoading(false);
      }
    );
    return stop;
  }, []);

  return { status, loading, error, refresh };
};
