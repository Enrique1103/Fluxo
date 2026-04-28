import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '../api/dashboard'

export function useHomeCurrency(): string {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  return me?.currency_default ?? 'UYU'
}
