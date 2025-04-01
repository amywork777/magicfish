"use client"

import { useState, useCallback, Suspense, useEffect, useRef } from "react"
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Upload, Wand2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useDropzone } from "react-dropzone"
import { STLConverter } from "@/components/stl-converter"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

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

  const [attempts, setAttempts] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Add effect to check API configuration on component mount
  useEffect(() => {
    const checkApiConfig = async () => {
      try {
        const response = await fetch("/api/health");
        const data = await response.json();
        console.log("API Health Check:", data);
        
        // Display toast with API configuration status
        if (data.envCheck?.TRIPO_API_KEY?.exists) {
          toast({
            title: "API Configuration",
            description: `TRIPO_API_KEY is configured (${data.envCheck.TRIPO_API_KEY.length} chars)`,
          });
        } else {
          toast({
            title: "API Configuration Issue",
            description: "TRIPO_API_KEY is not properly configured",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to check API configuration:", error);
        toast({
          title: "API Configuration Check Failed",
          description: "Could not verify API configuration",
          variant: "destructive",
        });
      }
    };
    
    checkApiConfig();
  }, [toast]);

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
        description: "Please enter a text prompt",
        variant: "destructive",
      });
      return;
    }

    try {
      // Reset all state before starting new generation
      setStatus("generating");
      setProgress(0);
      setErrorMessage(null);
      setModelUrl(null);
      setAttempts(0);
      setTaskId(null); // Clear any existing task ID
      
      // Clear any existing timeout
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      
      // Set to generating BEFORE making the API call
      setIsGenerating(true);
      
      // API call to generate model from text
      const response = await fetch('/api/generate-model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'text',
          prompt: textPrompt,
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Generate model API response:", data);

      // Set the task ID which will trigger polling via useEffect
      setTaskId(data.taskId);
      
      // Polling will be triggered by the useEffect that watches taskId and isGenerating
    } catch (error) {
      console.error("Error generating model:", error);
      setStatus("error");
      setIsGenerating(false);
      setErrorMessage("Failed to start model generation. Please try again.");
    }
  };

  const handleImageSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    try {
      // Reset all state before starting new generation
      setStatus("uploading");
      setProgress(0);
      setErrorMessage(null);
      setModelUrl(null);
      setAttempts(0);
      setTaskId(null); // Clear any existing task ID
      
      // Clear any existing timeout
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      
      // Set isGenerating BEFORE making the API call
      setIsGenerating(true);
      
      // Create form data
      const formData = new FormData();
      formData.append('image', selectedFile);

      // Upload the image
      const response = await fetch('/api/generate-model', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Generate model API response:", data);

      // Set task ID to start polling via useEffect
      setTaskId(data.taskId);
      setStatus("generating");
      
      // Polling will be triggered by the useEffect that watches taskId and isGenerating
    } catch (error) {
      console.error("Error generating model:", error);
      setStatus("error");
      setIsGenerating(false);
      setErrorMessage("Failed to upload image or start model generation. Please try again.");
    }
  };

  // Simplified polling function with stall detection
  const pollTaskStatus = async () => {
    if (!taskId || !isGenerating) return;
    
    try {
      console.log(`Polling task status for ${taskId}...`);
      
      const response = await fetch(`/api/task-status?taskId=${taskId}`);
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      console.log("Task status response:", data);
      
      // Handle different status cases
      if (data.status === "completed" || data.status === "success" || data.status === "succeeded") {
        console.log("Task completed successfully");
        setStatus("completed");
        setProgress(100);
        setIsGenerating(false);
        if (data.model_url) {
          setModelUrl(data.model_url);
        }
        // Clear any existing timeout
        if (pollingTimeoutRef.current) {
          clearTimeout(pollingTimeoutRef.current);
          pollingTimeoutRef.current = null;
        }
      } else if (data.status === "error" || data.status === "failed") {
        console.log("Task failed:", data.error);
        setStatus("error");
        setIsGenerating(false);
        setErrorMessage(data.error || "Task failed without specific error message");
        // Clear any existing timeout
        if (pollingTimeoutRef.current) {
          clearTimeout(pollingTimeoutRef.current);
          pollingTimeoutRef.current = null;
        }
      } else if (data.status === "processing" || data.status === "running") {
        // Update progress and continue polling
        setProgress(data.progress || 0);
        // Set up next poll with exponential backoff
        const nextPollDelay = Math.min(1000 * Math.pow(1.5, attempts), 10000);
        pollingTimeoutRef.current = setTimeout(pollTaskStatus, nextPollDelay);
      } else if (data.status === "queued") {
        // Task is in queue, continue polling with longer interval
        setProgress(0);
        pollingTimeoutRef.current = setTimeout(pollTaskStatus, 5000);
      } else {
        // Unknown status, log warning and continue polling
        console.warn("Unknown task status:", data.status);
        pollingTimeoutRef.current = setTimeout(pollTaskStatus, 5000);
      }
      
      // Increment attempts counter
      setAttempts(prev => prev + 1);
      
    } catch (error) {
      console.error("Error polling task status:", error);
      setStatus("error");
      setIsGenerating(false);
      setErrorMessage(error instanceof Error ? error.message : "Failed to check task status");
      // Clear any existing timeout
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    }
  };

  // Simple useEffect for starting/stopping polling
  useEffect(() => {
    if (taskId && isGenerating) {
      console.log(`Starting polling for task ID: ${taskId}`);
      pollTaskStatus();
    }
    
    // Cleanup
    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, [taskId, isGenerating]);

  const canGenerate = inputType === "text" ? !!textPrompt.trim() : !!selectedFile

  // Improved cancel function with better cleanup
  const handleCancel = () => {
    if (isGenerating) {
      console.log("Cancelling generation...");
      setIsGenerating(false);
      setStatus("idle");
      setProgress(0);
      setAttempts(0);
      setTaskId(null);
      setErrorMessage(null);
      
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
      
      toast({
        title: "Generation Cancelled",
        description: "You can start a new generation when ready.",
        duration: 3000,
      });
    }
  };

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
          
          {(status !== "idle" || progress > 0) && (
            <StatusDisplay 
              status={status} 
              progress={progress} 
              onCancel={handleCancel}
            />
          )}
          
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

// Let's update the StatusDisplay component to be more helpful
const StatusDisplay = ({ 
  status, 
  progress, 
  onCancel,
}: { 
  status: ModelGenerationStatus, 
  progress: number, 
  attempts?: number,
  onCancel: () => void,
}) => {
  // Determine wait time estimate based on progress
  let statusText = "";
  let statusColor = "";
  let statusDescription = "";
  
  if (status === "idle") {
    statusText = "Ready";
    statusColor = "bg-blue-500";
  } else if (status === "uploading") {
    statusText = "Uploading file...";
    statusColor = "bg-yellow-500";
    statusDescription = "Please wait while your file is being uploaded."
  } else if (status === "generating") {
    statusText = "Generating 3D model...";
    statusColor = "bg-yellow-500";
    
    // Provide more detailed info based on progress
    if (progress === 0) {
      statusDescription = "Your task is in queue. This may take a few minutes to start.";
    } else if (progress <= 5) {
      statusDescription = "Initial generation phase (1-3%). This is often the longest part and may appear stuck for several minutes.";
    } else if (progress <= 25) {
      statusDescription = "Creating base model structure (5-25%). Please wait.";
    } else if (progress <= 50) {
      statusDescription = "Refining the model (25-50%). Getting closer!";
    } else if (progress <= 75) {
      statusDescription = "Adding details to your 3D model (50-75%).";
    } else {
      statusDescription = "Almost done! Finalizing your 3D model (75-100%).";
    }
    
    // Special case for when it appears stuck at a low percentage (especially 3%)
    if (progress > 0 && progress < 5) {
      statusDescription += " The Tripo API often shows 2-3% for an extended time - this is normal.";
    }
  } else if (status === "completed") {
    statusText = "Model generated successfully!";
    statusColor = "bg-green-500";
    statusDescription = "Your 3D model is ready to view and download.";
  } else if (status === "error") {
    statusText = "Error generating model";
    statusColor = "bg-red-500";
    statusDescription = "Something went wrong. Please try again.";
  }

  return (
    <div className="w-full bg-slate-50 rounded-lg p-4 mt-4">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Status: {statusText}</h3>
          <div className={`w-3 h-3 rounded-full ${statusColor}`}></div>
        </div>
        
        {status === "generating" && (
          <div className="mt-2">
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                    Progress
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold inline-block text-blue-600">
                    {progress}%
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                <div style={{ width: `${progress}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"></div>
              </div>
              <p className="text-sm text-gray-600">{statusDescription}</p>
            </div>
          </div>
        )}
        
        {status !== "idle" && status !== "completed" && (
          <Button onClick={onCancel} variant="outline" className="mt-2">
            Cancel Generation
          </Button>
        )}
      </div>
    </div>
  );
};

