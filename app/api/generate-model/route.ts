import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  console.log("\n=== GENERATE MODEL API CALLED ===");
  try {
    // Log environment variable status
    const apiKey = process.env.TRIPO_API_KEY;
    if (!apiKey) {
      console.error("[generate-model] TRIPO_API_KEY is not configured");
      return NextResponse.json(
        { error: "API key not configured" },
        { status: 500 }
      );
    }
    
    const envStatus = {
      exists: !!apiKey,
      length: apiKey ? apiKey.length : 0,
      firstFourChars: apiKey ? apiKey.substring(0, 4) : "none",
      lastFourChars: apiKey ? apiKey.substring(apiKey.length - 4) : "none",
    };
    
    console.log("[generate-model] Environment check:", JSON.stringify(envStatus, null, 2));
    
    const body = await request.json()
    const { type, prompt, imageToken } = body
    console.log("[generate-model] Request body:", JSON.stringify(body, null, 2));

    let requestBody

    if (type === "text") {
      // Text to model - without textures
      requestBody = {
        type: "text_to_model",
        prompt,
        model_version: "v2.5-20250123",
        texture: false, // Disable textures
        pbr: false, // Disable PBR
        auto_size: true, // Enable auto-sizing for better proportions
      }
    } else if (type === "image") {
      // Image to model - without textures
      requestBody = {
        type: "image_to_model",
        model_version: "v2.5-20250123",
        file: {
          type: "jpg",
          file_token: imageToken,
        },
        texture: false, // Disable textures
        pbr: false, // Disable PBR
        auto_size: true, // Enable auto-sizing for better proportions
      }
    } else {
      console.error("[generate-model] Invalid generation type:", type);
      return NextResponse.json({ error: "Invalid generation type" }, { status: 400 })
    }

    console.log("[generate-model] Sending request to Tripo API:", JSON.stringify(requestBody, null, 2));

    // Create the Authorization header with additional checks
    // Use the specific API key provided by the user
    const authHeader = `Bearer ${apiKey}`;
    console.log("[generate-model] Authorization header created (length):", authHeader.length);
    console.log("[generate-model] API URL:", "https://api.tripo3d.ai/v2/openapi/task");

    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout
    
    try {
      // Call Tripo API to start model generation
      const tripoResponse = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);

      console.log("[generate-model] Tripo API response status:", tripoResponse.status);
      
      if (!tripoResponse.ok) {
        const errorData = await tripoResponse.json().catch(e => ({ error: "Failed to parse error response" }));
        console.error("[generate-model] Tripo API error:", JSON.stringify(errorData, null, 2));
        return NextResponse.json(
          { 
            error: "Failed to start model generation",
            status: tripoResponse.status,
            details: errorData
          }, 
          { status: tripoResponse.status }
        );
      }

      // Parse the response with error handling
      let data;
      try {
        data = await tripoResponse.json();
        console.log("[generate-model] Tripo API response:", JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error("[generate-model] Failed to parse Tripo API response:", parseError);
        return NextResponse.json(
          { 
            error: "Invalid response from Tripo API", 
            message: "Could not parse the response as JSON"
          }, 
          { status: 500 }
        );
      }
      
      // Check for Tripo API error codes
      if (data.code !== 0) {
        console.error("[generate-model] Tripo API returned an error code:", data.code);
        console.error("[generate-model] Error message:", data.message || "No message provided");
        
        // Handle specific Tripo error codes
        if (data.code === 2000) {
          return NextResponse.json(
            { 
              error: "Rate limit exceeded", 
              message: "You have exceeded the limit of generation. Please retry later.",
              tripoCode: data.code
            }, 
            { status: 429 }
          );
        } else if (data.code === 2010) {
          return NextResponse.json(
            { 
              error: "Insufficient credits", 
              message: "You need more credits to start a new task. Please review your usage.",
              tripoCode: data.code
            }, 
            { status: 403 }
          );
        } else if (data.code === 2008) {
          return NextResponse.json(
            { 
              error: "Content policy violation", 
              message: "The input violates Tripo's content policy. Please modify your input and retry.",
              tripoCode: data.code
            }, 
            { status: 400 }
          );
        } else {
          // Generic error handler for other error codes
          return NextResponse.json(
            { 
              error: "Tripo API error", 
              message: data.message || "An error occurred while generating the model",
              tripoCode: data.code,
              suggestion: data.suggestion || "Please try again or contact support"
            }, 
            { status: 400 }
          );
        }
      }
      
      // Check for expected response structure
      if (!data.data || !data.data.task_id) {
        console.error("[generate-model] Invalid Tripo API response - missing task_id");
        return NextResponse.json(
          { 
            error: "Invalid response from Tripo API", 
            message: "Missing task_id in response",
            raw: data
          }, 
          { status: 500 }
        );
      }

      const responseData = {
        taskId: data.data.task_id,
        message: "Model generation initiated successfully",
        timestamp: new Date().toISOString(),
        estimatedTime: type === "text" ? "5-10 minutes" : "3-8 minutes",
        tips: [
          "Generation starts at 0% while in queue",
          "Early stages (0-5%) typically take the longest",
          "The process cannot be canceled once started"
        ]
      };

      console.log("[generate-model] Sending response to client:", JSON.stringify(responseData, null, 2));
      console.log("=== GENERATE MODEL API COMPLETED ===\n");
      
      return NextResponse.json(responseData);
    } catch (fetchError: unknown) {
      // Clear the timeout
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error("[generate-model] API request timed out after 15 seconds");
        return NextResponse.json(
          { 
            error: "API request timeout", 
            message: "The request to Tripo API timed out after 15 seconds"
          }, 
          { status: 504 }
        );
      }
      
      // Re-throw for general error handling
      throw fetchError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("[generate-model] Error generating model:", errorMessage);
    if (errorStack) console.error("[generate-model] Error stack:", errorStack);
    
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      }, 
      { status: 500 }
    );
  }
}

