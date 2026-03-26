import { useState, useMemo } from 'react';

type SortOrder = 'asc' | 'desc' | null;

interface UseTableSortProps<T> {
  initialData?: T[];
}

export function useTableSort<T>({ initialData = [] }: UseTableSortProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);

  const handleSort = (key: keyof T) => {
    let newOrder: SortOrder = 'asc';
    
    // Toggle logic: asc -> desc -> null (reset)
    if (sortKey === key) {
      if (sortOrder === 'asc') newOrder = 'desc';
      else if (sortOrder === 'desc') newOrder = null;
    }

    setSortKey(newOrder ? key : null);
    setSortOrder(newOrder);
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortOrder) return initialData;

    return [...initialData].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      // Handle nested or derived state if passed specifically, 
      // but for generic strings/numbers:
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase() as any;
      }
      if (typeof bVal === 'string') {
        bVal = bVal.toLowerCase() as any;
      }

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1; // Push nulls/undefined to bottom
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal > bVal ? 1 : -1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [initialData, sortKey, sortOrder]);

  return { sortedData, sortKey, sortOrder, handleSort };
}
