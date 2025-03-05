"use client"

import { useState, useCallback, Suspense } from "react"
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Upload, Wand2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useDropzone } from "react-dropzone"
import { STLConverter } from "@/components/stl-converter"

// Dynamically import the ModelViewer component with SSR disabled
const ModelViewer = dynamic(
  () => import('@/components/model-viewer').then((mod) => mod.ModelViewer),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-[450px] bg-gray-100 rounded-lg overflow-hidden border flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-t-2 border-primary border-solid rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading 3D Viewer...</p>
        </div>
      </div>
    )
  }
)

type ModelGenerationStatus = "idle" | "uploading" | "generating" | "completed" | "error"
type InputType = "text" | "image"

export function ModelGenerator() {
  const [inputType, setInputType] = useState<InputType>("text")
  const [textPrompt, setTextPrompt] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [status, setStatus] = useState<ModelGenerationStatus>("idle")
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const { toast } = useToast()

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [],
      "image/png": [],
    },
    maxFiles: 1,
    disabled: status === "uploading" || status === "generating",
  })

  const handleTextSubmit = async () => {
    if (!textPrompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a description for your 3D model",
        variant: "destructive",
      })
      return
    }

    try {
      setStatus("generating")
      setProgress(0)
      setIsGenerating(true)

      // Call the API to start text-to-model generation
      const response = await fetch("/api/generate-model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "text",
          prompt: textPrompt,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to start model generation")
      }

      const data = await response.json()
      setTaskId(data.taskId)

      // Start polling for task status
      pollTaskStatus(data.taskId)
    } catch (error) {
      console.error("Error generating model:", error)
      setStatus("error")
      setIsGenerating(false)
      toast({
        title: "Error",
        description: "Failed to generate model. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleImageSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "Error",
        description: "Please select an image to upload",
        variant: "destructive",
      })
      return
    }

    try {
      setStatus("uploading")
      setProgress(0)
      setIsGenerating(true)

      // First upload the image
      const formData = new FormData()
      formData.append("file", selectedFile)

      const uploadResponse = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image")
      }

      const uploadData = await uploadResponse.json()

      // Then start the image-to-model generation
      setStatus("generating")
      const response = await fetch("/api/generate-model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "image",
          imageToken: uploadData.imageToken,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to start model generation")
      }

      const data = await response.json()
      setTaskId(data.taskId)

      // Start polling for task status
      pollTaskStatus(data.taskId)
    } catch (error) {
      console.error("Error generating model:", error)
      setStatus("error")
      setIsGenerating(false)
      toast({
        title: "Error",
        description: "Failed to generate model. Please try again.",
        variant: "destructive",
      })
    }
  }

  const pollTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`/api/task-status?taskId=${taskId}`)

      if (!response.ok) {
        throw new Error("Failed to get task status")
      }

      const data = await response.json()

      if (data.status === "success") {
        setStatus("completed")
        setModelUrl(data.modelUrl)
        setProgress(100)
        setIsGenerating(false)
        toast({
          title: "Success!",
          description: "Your 3D model has been generated successfully.",
        })
      } else if (data.status === "failed" || data.status === "cancelled" || data.status === "unknown") {
        setStatus("error")
        setIsGenerating(false)
        toast({
          title: "Error",
          description: "Model generation failed. Please try again.",
          variant: "destructive",
        })
      } else {
        // Still in progress
        setProgress(data.progress || 0)
        // Poll again after a delay
        setTimeout(() => pollTaskStatus(taskId), 2000)
      }
    } catch (error) {
      console.error("Error polling task status:", error)
      setStatus("error")
      setIsGenerating(false)
      toast({
        title: "Error",
        description: "Failed to check model generation status. Please try again.",
        variant: "destructive",
      })
    }
  }

  const canGenerate = inputType === "text" ? !!textPrompt.trim() : !!selectedFile

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Card className="md:h-[600px] flex flex-col shadow-md border-gray-200">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl">Create Your 3D Model</CardTitle>
          <CardDescription className="text-base">
            Generate detailed 3D models from text descriptions or images
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col pb-6">
          <Tabs
            defaultValue="text"
            className="flex-1 flex flex-col"
            onValueChange={(value) => setInputType(value as InputType)}
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="text">Text Description</TabsTrigger>
              <TabsTrigger value="image">Upload Image</TabsTrigger>
            </TabsList>
            <div className="flex-1 flex flex-col">
              <TabsContent value="text" className="flex-1 flex flex-col mt-0">
                <Textarea
                  placeholder="Describe the 3D object or character you want to create..."
                  className="flex-1 min-h-[200px] text-base resize-none p-4"
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  disabled={isGenerating}
                />
              </TabsContent>
              <TabsContent value="image" className="flex-1 flex flex-col mt-0">
                <div
                  {...getRootProps()}
                  className={`border-2 ${isDragActive ? "border-primary" : "border-dashed"} rounded-lg p-8 flex flex-col items-center justify-center gap-4 flex-1 cursor-pointer transition-colors ${isGenerating ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
                >
                  <input {...getInputProps()} />
                  {previewUrl ? (
                    <div className="relative w-full h-[300px]">
                      <img
                        src={previewUrl || "/placeholder.svg"}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                      {!isGenerating && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute top-2 right-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedFile(null)
                            setPreviewUrl(null)
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className={`p-6 rounded-full bg-gray-50 ${isDragActive ? "bg-primary/10" : ""}`}>
                        <Upload className="h-10 w-10 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-base font-medium">
                          {isDragActive ? "Drop the image here" : "Drag and drop an image"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <Button
            className="w-full mt-6"
            size="lg"
            onClick={inputType === "text" ? handleTextSubmit : handleImageSubmit}
            disabled={isGenerating || !canGenerate}
          >
            {isGenerating ? (
              <>
                <span className="mr-2">Generating</span>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-5 w-5" />
                Generate 3D Model
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:h-[600px] flex flex-col shadow-md border-gray-200">
        <CardHeader className="pb-4">
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">3D Model Preview</CardTitle>
              <CardDescription className="text-base">View and interact with your generated 3D model</CardDescription>
            </div>
            {status === "completed" && <STLConverter modelUrl={modelUrl} />}
          </div>
        </CardHeader>
        <CardContent className="flex-1 pb-6">
          <ModelViewer modelUrl={modelUrl} status={status} progress={progress} />
        </CardContent>
      </Card>
    </div>
  )
}

