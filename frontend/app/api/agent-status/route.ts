import { NextResponse } from "next/server";

export async function GET() {
  // Fetch from backend API
  try {
    const res = await fetch("http://localhost:8080/status");
    if (!res.ok) {
      console.log("[agent-status] Backend not ok", res.status);
      return NextResponse.json({ status: "offline", network: "unknown" });
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.log("[agent-status] Backend returned non-JSON:", text);
      return NextResponse.json({ status: "offline", network: "unknown" });
    }
    console.log("[agent-status] Backend returned:", data);
    return NextResponse.json(data);
  } catch (e) {
    console.log("[agent-status] Fetch error:", e);
    return NextResponse.json({ status: "offline", network: "unknown" });
  }
}
