'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './sidebar'

export function SidebarWrapper() {
  const pathname = usePathname()
  const hideSidebar = pathname === '/' || pathname === '/login' || pathname.startsWith('/auth/')
  if (hideSidebar) return null
  return <Sidebar />
}
