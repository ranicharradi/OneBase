/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useSearchParams } from 'react-router'
import type { RecordTypeSummary } from '../api/types'
import { useRecordTypes } from '../hooks/useRecordTypes'
import { defaultType } from '../utils/recordDisplay'

const RECORD_TYPE_STORAGE_KEY = 'onebase_record_type'
const SCOPED_ROUTE_PREFIXES = ['/runs', '/review', '/merge', '/unified']

interface RecordTypeContextValue {
  selectedType: string
  recordTypes: RecordTypeSummary[]
  isLoading: boolean
  setSelectedType: (type: string) => void
  withRecordType: (to: string) => string
}

const DEFAULT_RECORD_TYPE = 'supplier'

const RecordTypeContext = createContext<RecordTypeContextValue>({
  selectedType: DEFAULT_RECORD_TYPE,
  recordTypes: [],
  isLoading: false,
  setSelectedType: () => {},
  withRecordType: (to: string) => addRecordTypeToPath(to, DEFAULT_RECORD_TYPE),
})

function readStoredRecordType(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(RECORD_TYPE_STORAGE_KEY)
}

function writeStoredRecordType(type: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RECORD_TYPE_STORAGE_KEY, type)
}

export function isRecordTypeScopedPath(pathname: string): boolean {
  return SCOPED_ROUTE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function addRecordTypeToPath(to: string, type: string): string {
  const [pathAndSearch, hash] = to.split('#')
  const [pathname, search = ''] = pathAndSearch.split('?')
  if (!isRecordTypeScopedPath(pathname)) return to

  const params = new URLSearchParams(search)
  params.set('type', type)
  const query = params.toString()
  return `${pathname}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}

function isKnownType(type: string | null, types: RecordTypeSummary[]): type is string {
  if (!type) return false
  return types.length === 0 || types.some(t => t.key === type)
}

function useRecordTypeSelection(): RecordTypeContextValue {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, isLoading } = useRecordTypes()
  const recordTypes = useMemo(() => data?.types ?? [], [data?.types])
  const [storedType, setStoredType] = useState(() => readStoredRecordType())

  const selectedType = useMemo(() => {
    const urlType = searchParams.get('type')
    if (isKnownType(urlType, recordTypes)) return urlType
    if (isKnownType(storedType, recordTypes)) return storedType
    return defaultType(recordTypes)
  }, [recordTypes, searchParams, storedType])

  useEffect(() => {
    if (selectedType) writeStoredRecordType(selectedType)
  }, [selectedType])

  useEffect(() => {
    if (!selectedType || !isRecordTypeScopedPath(location.pathname)) return
    if (searchParams.get('type') === selectedType) return

    const next = new URLSearchParams(searchParams)
    next.set('type', selectedType)
    setSearchParams(next, { replace: true })
  }, [location.pathname, searchParams, selectedType, setSearchParams])

  const setSelectedType = useCallback((type: string) => {
    setStoredType(type)
    writeStoredRecordType(type)

    if (!isRecordTypeScopedPath(location.pathname)) return
    const next = new URLSearchParams(searchParams)
    next.set('type', type)
    setSearchParams(next)
  }, [location.pathname, searchParams, setSearchParams])

  const withRecordType = useCallback((to: string) => addRecordTypeToPath(to, selectedType), [selectedType])

  return { selectedType, recordTypes, isLoading, setSelectedType, withRecordType }
}

export function RecordTypeProvider({ children }: { children: ReactNode }) {
  const value = useRecordTypeSelection()
  return (
    <RecordTypeContext.Provider value={value}>
      {children}
    </RecordTypeContext.Provider>
  )
}

export function useSelectedRecordType() {
  return useContext(RecordTypeContext)
}
