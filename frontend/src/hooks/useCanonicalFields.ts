import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CanonicalFieldsResponse } from '../api/types';

export function useCanonicalFields() {
  return useQuery({
    queryKey: ['canonical-fields'],
    queryFn: () => api.get<CanonicalFieldsResponse>('/api/canonical-fields'),
    // Registry is deploy-static — never refetch (staleTime) or evict (gcTime) within a session.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
