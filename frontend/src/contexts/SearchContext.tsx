import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SearchContextType {
  query: string;
  isOpen: boolean;
  setQuery: (q: string) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => { setIsOpen(false); setQuery(''); }, []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <SearchContext.Provider value={{ query, isOpen, setQuery, open, close, toggle }}>
      {children}
    </SearchContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSearch(): SearchContextType {
  const context = useContext(SearchContext);
  if (!context) throw new Error('useSearch must be used within SearchProvider');
  return context;
}
