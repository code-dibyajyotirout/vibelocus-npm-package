import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gradioUrl, prompt, system } = body;

    if (!gradioUrl) {
      return NextResponse.json({ error: "Missing gradioUrl" }, { status: 400 });
    }

    const cleanBase = gradioUrl
      .replace(/\/v1\/chat\/completions\/?$/, "")
      .replace(/\/$/, "");

    // Step 1: POST to Gradio to get event_id
    const initRes = await fetch(`${cleanBase}/gradio_api/call/query_ollama`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [prompt || "", system || ""] }),
    });

    if (!initRes.ok) {
      const statusCode = initRes.status;
      let friendlyError = `Gradio endpoint returned HTTP ${statusCode}.`;
      if (statusCode === 404) {
        friendlyError = "Colab Gradio tunnel is offline. Re-run your Colab notebook to get a fresh URL.";
      } else if (statusCode === 502 || statusCode === 503) {
        friendlyError = "Colab Gradio tunnel is temporarily unavailable. The GPU runtime may have disconnected.";
      } else if (statusCode === 429) {
        friendlyError = "Rate limited by Gradio. Wait a moment and try again.";
      }
      return NextResponse.json(
        { error: friendlyError },
        { status: 400 }
      );
    }

    const initData = await initRes.json();

    if (!initData.event_id) {
      return NextResponse.json(
        { error: "No event_id from Gradio" },
        { status: 500 }
      );
    }

    // Step 2: GET the SSE stream result
    const sseRes = await fetch(
      `${cleanBase}/gradio_api/call/query_ollama/${initData.event_id}`
    );
    const sseText = await sseRes.text();

    // Step 3: Parse SSE data lines
    const dataLines = sseText.split("\n").filter((l: string) => l.startsWith("data:"));
    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        const jsonStr = dataLines[i].replace(/^data:\s*/, "").trim();
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
          return NextResponse.json({
            choices: [{ message: { role: "assistant", content: parsed[0] } }],
          });
        }
      } catch {}
    }

    return NextResponse.json(
      { error: "Empty response from Gradio" },
      { status: 500 }
    );
  } catch (e: any) {
    console.error("Gradio proxy error:", e);
    return NextResponse.json(
      { error: e.message || "Internal proxy error" },
      { status: 500 }
    );
  }
}
