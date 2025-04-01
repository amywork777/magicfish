import { type NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

// Define types for better type safety
type TripoTaskStatus = "success" | "waiting" | "running" | "failed" | "cancelled" | "unknown"

interface TripoTaskResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
    status: TripoTaskStatus;
    progress?: number;
    output?: {
      model?: string;
      base_model?: string;
      rendered_image?: string;
    };
    error_message?: string;
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  
  if (!taskId) {
    console.error("Task status request failed: No taskId provided");
    return NextResponse.json(
      { status: "error", error: "Task ID is required" },
      { status: 400 }
    );
  }
  
  console.log(`Checking status for task ${taskId}...`);
  // Use environment variable for API key
  const apiKey = process.env.TRIPO_API_KEY;
  
  if (!apiKey) {
    console.error("TRIPO_API_KEY is not defined in the environment variables");
    return NextResponse.json(
      { status: "error", error: "API key not configured" },
      { status: 500 }
    );
  }
  
  // Create a controller to handle timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // Increase timeout to 30 seconds
  
  try {
    console.log(`Fetching task status from Tripo API for task ${taskId}...`);
    const startTime = Date.now();
    
    const response = await fetch(
      `https://api.tripo3d.ai/v2/openapi/task/${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      }
    );
    
    const responseTime = Date.now() - startTime;
    console.log(`Tripo API response time: ${responseTime}ms`);
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(
        `Tripo API request failed: ${response.status} ${response.statusText}`
      );
      return NextResponse.json(
        {
          status: "error",
          error: `API request failed: ${response.status} ${response.statusText}`,
        },
        { status: response.status }
      );
    }
    
    // Parse the response
    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error("Error parsing Tripo API response:", error);
      return NextResponse.json(
        { status: "error", error: "Error parsing API response" },
        { status: 500 }
      );
    }
    
    // Validate the response data
    if (!data || typeof data !== "object") {
      console.error("Invalid response data:", data);
      return NextResponse.json(
        { status: "error", error: "Invalid response data" },
        { status: 500 }
      );
    }
    
    console.log(`Raw Tripo response for task ${taskId}:`, data);
    
    // Format the response based on Tripo API response
    if (data.data?.status === "waiting") {
      // For queued tasks, add estimated queue time and position if available
      const queuePosition = data.data?.queue_position !== undefined ? data.data.queue_position : 0;
      const queueSize = data.data?.queue_size !== undefined ? data.data.queue_size : null;
      const estimatedWaitTime = data.data?.running_left_time !== undefined ? 
        Math.max(1, Math.round(data.data.running_left_time * 60)) : 120; // default to 2 minutes if not provided
      
      // Log detailed queue information
      console.log(`Task ${taskId} is queued. Position: ${queuePosition}, Queue size: ${queueSize || 'unknown'}, Estimated wait: ${estimatedWaitTime}s`);
      
      return NextResponse.json({
        status: "queued",
        progress: 0,
        task_id: taskId,
        queue_position: queuePosition,
        queue_size: queueSize,
        eta: estimatedWaitTime,
        raw_response: data,
      });
    } else if (data.data?.status === "running") {
      // Calculate remaining time based on progress and speed
      const progress = data.data?.progress || 0;
      const eta = data.data?.running_left_time !== undefined ?
        Math.max(1, Math.round(data.data.running_left_time * 60)) : // convert minutes to seconds
        Math.max(1, Math.round((100 - progress) / 5)); // rough estimate: 5% per 30 seconds
      
      return NextResponse.json({
        status: "processing",
        progress: progress,
        task_id: taskId,
        eta: eta,
        raw_response: data,
      });
    } else if (data.data?.status === "succeeded") {
      return NextResponse.json({
        status: "completed",
        progress: 100,
        task_id: taskId,
        model_url: data.data?.result?.model_url,
        thumbnail_url: data.data?.result?.thumbnail_url,
        raw_response: data,
      });
    } else if (data.data?.status === "failed") {
      const errorMessage = data.data?.error_message || "Task failed without specific error message";
      console.error(`Task ${taskId} failed: ${errorMessage}`);
      
      return NextResponse.json({
        status: "error",
        error: errorMessage,
        task_id: taskId,
        raw_response: data,
      });
    } else {
      // Handle unknown status
      console.warn(`Unknown task status for ${taskId}: ${data.data?.status}`);
      return NextResponse.json({
        status: "unknown",
        original_status: data.data?.status,
        task_id: taskId,
        raw_response: data,
      });
    }
  } catch (fetchError: unknown) {
    clearTimeout(timeoutId);
    
    // Handle fetch errors, including timeouts
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      console.error(`Fetch request for task ${taskId} timed out after 30 seconds`);
      return NextResponse.json(
        { 
          status: "error", 
          error: "Request timed out", 
          timeout: "30s",
          task_id: taskId 
        },
        { status: 504 }
      );
    }
    
    console.error("Error fetching task status:", fetchError);
    return NextResponse.json(
      { 
        status: "error", 
        error: fetchError instanceof Error ? fetchError.message : "Unknown error",
        task_id: taskId 
      },
      { status: 500 }
    );
  }
}

