import { Suspense } from 'react'
import { Navbar } from "@/components/navbar"
import { Toaster } from "@/components/ui/toaster"
import ClientPage from './client-page'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <div className="flex-1 container mx-auto py-12 px-4">
        <div className="flex flex-col space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tighter">Magic Fish AI</h1>
            <p className="text-xl text-muted-foreground">Generate amazing 3D models from text or images</p>
          </div>
          
          <Suspense fallback={
            <div className="h-[600px] w-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-10 h-10 border-t-2 border-primary border-solid rounded-full animate-spin mx-auto mb-4"></div>
                <p>Loading 3D Model Generator...</p>
              </div>
            </div>
          }>
            <ClientPage />
          </Suspense>
        </div>
      </div>
      <Toaster />
    </main>
  )
}

