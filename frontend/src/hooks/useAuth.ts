'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Employee {
  id: number
  firstName: string
  lastName: string
  email: string
  role: 'USER' | 'ADMIN' | 'HR'
}

interface AuthState {
  isLoading: boolean
  isAuthenticated: boolean
  employee: Employee | null
}

/**
 * Auth guard hook. Checks localStorage for cached employee data.
 * The actual auth token is an HttpOnly cookie — invisible to JS.
 * Redirects to /login if no employee data found or role doesn't match.
 *
 * @param requiredRole - If provided, only allows users with this role
 */
export function useAuth(requiredRole?: 'ADMIN' | 'HR'): AuthState {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    employee: null,
  })

  useEffect(() => {
    // Token is in an HttpOnly cookie — we can't read it here, and that's the point.
    // We use the cached employee record (non-sensitive: name, role, id) for UI state.
    const employeeStr = localStorage.getItem('employee')

    if (!employeeStr) {
      router.replace('/login')
      return
    }

    try {
      const employee: Employee = JSON.parse(employeeStr)

      // Check role if required
      if (requiredRole && employee.role !== requiredRole) {
        router.replace('/login')
        return
      }

      setState({
        isLoading: false,
        isAuthenticated: true,
        employee,
      })
    } catch {
      // Invalid data in localStorage
      localStorage.removeItem('employee')
      router.replace('/login')
    }
  }, [router, requiredRole])

  return state
}
