import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { api } from '@/lib/api';

/**
 * Loads an image the API only gives to signed-in users (e.g. the hospital logo)
 * and returns a local object URL for <img src>. A plain <img> can't send the
 * access token. The path is versioned, so it's safe to cache it for good.
 */
export function useProtectedImage(path: string | null) {
  const { data: blob } = useQuery({
    queryKey: ['protected-image', path],
    queryFn: async () =>
      (await api.get<Blob>(path!, { responseType: 'blob', skipErrorToast: true })).data,
    enabled: Boolean(path),
    staleTime: Infinity,
  });

  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}
