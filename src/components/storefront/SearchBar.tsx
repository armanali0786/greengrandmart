'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';

export function SearchBar({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
  }

  function handleClear() {
    setValue('');
    router.push('/search');
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="relative">
      <label htmlFor="search-input" className="sr-only">
        Search products
      </label>
      <Search
        className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        id="search-input"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search products…"
        maxLength={200}
        className="border-border bg-surface focus:border-primary-600 focus:ring-primary-500/30 h-11 w-full rounded-[10px] border pr-9 pl-9 text-sm focus:ring-2 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="text-muted hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
