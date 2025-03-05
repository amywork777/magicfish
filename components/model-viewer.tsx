"use client"

import { useEffect, useState, useRef } from "react"
import { Loader2, AlertCircle } from "lucide-react"
// Import types only
import type * as THREE from 'three'
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GLTFLoader as GLTFLoaderType } from 'three/examples/jsm/loaders/GLTFLoader.js'

// Separate all THREE imports and definitions inside a client-only component
const ThreeModelViewer = ({ url }: { url: string }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Only import Three.js and related libraries on the client
    const loadModelViewer = async () => {
      try {
        setIsLoading(true)
        setError(false)

        // Dynamically import Three.js and related libraries
        const THREE = await import('three')
        const OrbitControlsModule = await import('three/examples/jsm/controls/OrbitControls.js')
        const GLTFLoaderModule = await import('three/examples/jsm/loaders/GLTFLoader.js')
        
        const OrbitControls = OrbitControlsModule.OrbitControls
        const GLTFLoader = GLTFLoaderModule.GLTFLoader

        // Setup renderer
        if (!containerRef.current) return

        // Create renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.shadowMap.enabled = true
        
        // Clear any existing canvas
        containerRef.current.innerHTML = ''
        containerRef.current.appendChild(renderer.domElement)

        // Create scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0xf5f5f5)

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
        scene.add(ambientLight)

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1)
        directionalLight1.position.set(5, 10, 5)
        directionalLight1.castShadow = true
        scene.add(directionalLight1)

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight2.position.set(-5, 10, 5)
        scene.add(directionalLight2)

        const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.3)
        directionalLight3.position.set(0, -10, 0)
        scene.add(directionalLight3)

        // Setup camera
        const camera = new THREE.PerspectiveCamera(
          50, 
          containerRef.current.clientWidth / containerRef.current.clientHeight, 
          0.1, 
          1000
        )
        camera.position.set(0, 0, 5)

        // Add orbit controls
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.1

        // Create loader
        const loader = new GLTFLoader()
        
        // Load the model
        loader.load(
          url,
          (gltf: any) => {
            const model = gltf.scene

            // Apply white material to all meshes
            const whiteMaterial = new THREE.MeshStandardMaterial({
              color: 0xffffff,
              roughness: 0.3,
              metalness: 0.1,
            })

            model.traverse((child: any) => {
              if (child instanceof THREE.Mesh) {
                child.material = whiteMaterial
                child.castShadow = true
                child.receiveShadow = true
              }
            })

            // Center and scale model
            const box = new THREE.Box3().setFromObject(model)
            const center = box.getCenter(new THREE.Vector3())
            const size = box.getSize(new THREE.Vector3())

            // Adjust camera position based on model size
            const maxDim = Math.max(size.x, size.y, size.z)
            const fov = camera.fov * (Math.PI / 180)
            const cameraZ = Math.abs(maxDim / Math.sin(fov / 2))

            // Set camera position
            camera.position.set(center.x, center.y, center.z + cameraZ * 1.5)
            camera.lookAt(center)
            camera.updateProjectionMatrix()

            // Add model to scene
            scene.add(model)
            setIsLoading(false)

            // Animation loop
            const animate = () => {
              requestAnimationFrame(animate)
              controls.update()
              renderer.render(scene, camera)
            }

            animate()

            // Handle resize
            const handleResize = () => {
              if (!containerRef.current) return
              const width = containerRef.current.clientWidth
              const height = containerRef.current.clientHeight
              
              camera.aspect = width / height
              camera.updateProjectionMatrix()
              
              renderer.setSize(width, height)
            }

            window.addEventListener('resize', handleResize)
            
            // Cleanup
            return () => {
              window.removeEventListener('resize', handleResize)
              scene.remove(model)
              renderer.dispose()
            }
          },
          undefined,
          (err: unknown) => {
            console.error('Error loading model:', err)
            setError(true)
            setIsLoading(false)
          }
        )
      } catch (err) {
        console.error('Error in ThreeModelViewer:', err)
        setError(true)
        setIsLoading(false)
      }
    }

    loadModelViewer()

    // Cleanup function
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [url])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <span className="ml-2">Loading 3D model...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive">
        <AlertCircle className="h-10 w-10 mb-2" />
        <span>Failed to load model</span>
      </div>
    )
  }

  return <div ref={containerRef} className="w-full h-full" />
}

// ModelViewer props interface
interface ModelViewerProps {
  modelUrl: string | null
  status: "idle" | "uploading" | "generating" | "completed" | "error"
  progress: number
}

// The main component that safely handles the Three.js viewer
export function ModelViewer({ modelUrl, status, progress }: ModelViewerProps) {
  const [isMounted, setIsMounted] = useState(false)

  // Only render on client
  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return <div className="w-full h-[450px] bg-gray-100 rounded-lg overflow-hidden border flex items-center justify-center">Loading viewer...</div>
  }

  return (
    <div className="w-full h-[450px] bg-gray-100 rounded-lg overflow-hidden border">
      {status === "completed" && modelUrl ? (
        <ThreeModelViewer url={modelUrl} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100">
          {status === "idle" ? (
            <div className="text-center p-6 max-w-md">
              <img
                src="/placeholder.svg?height=120&width=120"
                alt="3D model placeholder"
                className="mx-auto mb-4 opacity-20"
              />
              <p className="text-muted-foreground text-lg">Your 3D model will appear here</p>
              <p className="text-muted-foreground text-sm mt-2">
                Enter a description or upload an image to generate a 3D model
              </p>
            </div>
          ) : status === "error" ? (
            <div className="text-center text-destructive p-6">
              <AlertCircle className="h-12 w-12 mx-auto mb-4" />
              <p className="font-medium">Error generating model</p>
              <p className="text-sm mt-2">Please try again with a different prompt or image</p>
            </div>
          ) : (
            <div className="text-center p-6">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-primary font-medium">
                {status === "uploading" ? "Uploading image..." : `Generating 3D model`}
              </p>
              {status === "generating" && (
                <div className="mt-4 w-64 mx-auto">
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300 ease-in-out"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{progress}% complete</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

