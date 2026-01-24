import { NextRequest, NextResponse } from "next/server";

const SEVERITY_PRIORITY = {
  high: 3,
  medium: 2,
  low: 1,
} as const;

const CLASS_SEVERITY: Record<string, keyof typeof SEVERITY_PRIORITY> = {
  "fire": "high",
  "car accident": "high",
  "slop failure": "high",
  "electricity": "medium",
  "boulder": "low",
  "cattle": "low",
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const apiKey = process.env.ROBOFLOW_API_KEY;
    const modelId = process.env.ROBOFLOW_MODEL_ID;
    const modelVersion = process.env.ROBOFLOW_MODEL_VERSION;

    if (!apiKey || !modelId || !modelVersion) {
      return NextResponse.json(
        { error: "Roboflow credentials are not configured" },
        { status: 500 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const confidence = Number(formData.get("confidence")) || 0.4;
    const url = `https://detect.roboflow.com/${modelId}/${modelVersion}?api_key=${apiKey}&confidence=${confidence}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `image=${encodeURIComponent(base64)}`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Roboflow request failed", details: errorText },
        { status: 502 }
      );
    }

    const result = await response.json();
    const predictions = Array.isArray(result?.predictions) ? result.predictions : [];

    const detected = predictions
      .map((p: { class?: string; confidence?: number }) => ({
        name: String(p.class || "").toLowerCase(),
        confidence: typeof p.confidence === "number" ? p.confidence : 0,
      }))
      .filter((p: { name: string; confidence: number }) => p.name && p.confidence >= confidence);

    if (detected.length === 0) {
      return NextResponse.json({ detected: [], severity: null });
    }

    const detectedClasses = Array.from(
      new Set(detected.map((d: { name: string; confidence: number }) => d.name))
    );

    const severity = detectedClasses.reduce<keyof typeof SEVERITY_PRIORITY | null>(
      (acc, name) => {
        const current = CLASS_SEVERITY[name];
        if (!current) return acc;
        if (!acc) return current;
        return SEVERITY_PRIORITY[current] > SEVERITY_PRIORITY[acc] ? current : acc;
      },
      null
    );

    return NextResponse.json({
      detected: detectedClasses,
      confidence,
      severity,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Detection failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
