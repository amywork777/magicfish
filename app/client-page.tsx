'use client'

import { lazy, Suspense } from 'react'

// Lazy load the ModelGenerator component to ensure it only loads on the client
const ModelGenerator = lazy(() => import('@/components/model-generator').then(mod => ({ 
  default: mod.ModelGenerator 
})))

export default function ClientPage() {
  return (
    <Suspense fallback={
      <div className="h-[600px] w-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-t-2 border-primary border-solid rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading 3D Model Generator...</p>
        </div>
      </div>
    }>
      <ModelGenerator />
    </Suspense>
  )
} 