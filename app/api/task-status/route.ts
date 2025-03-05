import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const taskId = request.nextUrl.searchParams.get("taskId")

    if (!taskId) {
      return NextResponse.json({ error: "Task ID is required" }, { status: 400 })
    }

    // Call Tripo API to get task status
    const tripoResponse = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.TRIPO_API_KEY}`,
      },
    })

    if (!tripoResponse.ok) {
      const errorData = await tripoResponse.json()
      console.error("Tripo API error:", errorData)
      return NextResponse.json({ error: "Failed to get task status" }, { status: tripoResponse.status })
    }

    const data = await tripoResponse.json()
    const taskData = data.data

    console.log("Task status:", taskData.status)
    console.log("Task progress:", taskData.progress)

    if (taskData.status === "success") {
      console.log("Model URL:", taskData.output.model)
      console.log("Base model URL:", taskData.output.base_model)
    }

    // Format the response
    const response = {
      status: taskData.status,
      progress: taskData.progress,
      modelUrl: taskData.status === "success" ? taskData.output.base_model || taskData.output.model : null,
      renderedImage: taskData.status === "success" ? taskData.output.rendered_image : null,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error getting task status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

