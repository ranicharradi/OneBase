import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { RecordType, RecordTypeListResponse } from '../api/types'

export function useRecordTypes() {
  return useQuery({
    queryKey: ['record-types'],
    queryFn: () => api.get<RecordTypeListResponse>('/api/record-types'),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

export function useRecordType(type: string | null | undefined) {
  return useQuery({
    queryKey: ['record-type', type],
    queryFn: () => api.get<RecordType>(`/api/record-types/${type}`),
    enabled: Boolean(type),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}
