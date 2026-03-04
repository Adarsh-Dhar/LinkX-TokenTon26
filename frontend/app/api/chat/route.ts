import { NextResponse } from "next/server";
import { isRateLimited } from "./rateLimiter";
import fs from "fs";
import path from "path";

// Intent extraction using OpenRouter for chat-to-agent C2
async function extractIntent(message: string): Promise<{ action: string; params?: any }> {
  const systemPrompt = `You are a trading assistant that converts user speech into structured commands.
Possible actions:
- "aggressive" / "be aggressive" / "lower risk" → {"action": "SET_RISK", "risk": 0.1}
- "conservative" / "be conservative" / "higher threshold" → {"action": "SET_RISK", "risk": 0.85}
- "go long" / "buy bias" / "bullish" → {"action": "SET_BIAS", "bias": "LONG"}
- "go short" / "sell bias" / "bearish" → {"action": "SET_BIAS", "bias": "SHORT"}
- "neutral" / "no bias" / "AI discretion" → {"action": "SET_BIAS", "bias": "NONE"}
- "pause" / "stop trading" → {"action": "PAUSE"}
- "resume" / "start trading" → {"action": "RESUME"}
- anything else → {"action": "CHAT"}

Return ONLY valid JSON.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return JSON.parse(content || '{"action": "CHAT"}');
  } catch (error) {
    console.error("[Intent Extraction Error]", error);
    return { action: "CHAT" };
  }
}

// This is the Next.js API Route that the frontend calls.
// It acts as a proxy to the Python Agent.
export async function POST(req: Request) {
  try {
    const { message, userId = "anonymous" } = await req.json();

    // Rate limiting
    if (isRateLimited(userId)) {
      return NextResponse.json({
        response: "⏳ Rate limit exceeded. Please wait before sending more context."
      }, { status: 429 });
    }

    // 1. Extract intent from user message
    const intent = await extractIntent(message);
    console.log("[Chat Intent]", intent);

    // 2. If message is actionable context, write override_state.json
    // Example: "There is a massive short squeeze starting on BTC"
    if (intent.action === "CHAT" && message && message.length > 10) {
      // Write override_state.json with external_context and priority HIGH
      const overridePath = path.resolve(process.cwd(), "override_state.json");
      const overrideState = {
        external_context: message,
        priority: "HIGH",
        timestamp: Date.now()
      };
      fs.writeFileSync(overridePath, JSON.stringify(overrideState, null, 2));
      return NextResponse.json({
        response: "🟣 Human context injected. Agent will divert its mind."
      });
    }

    // 3. Route based on intent action (risk/bias overrides)
    if (intent.action === "SET_RISK" || intent.action === "SET_BIAS") {
      const overrideResponse = await fetch("http://127.0.0.1:8080/agent/control/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risk: intent.action === "SET_RISK" ? intent.params?.risk : undefined,
          bias: intent.action === "SET_BIAS" ? intent.params?.bias : undefined
        })
      });
      const overrideData = await overrideResponse.json();
      if (overrideData.status === "Override Applied Successfully") {
        const config = overrideData.current_config;
        return NextResponse.json({
          response: `✅ Maneuver accepted:\n• Risk Threshold: ${config.risk_threshold}\n• Bias: ${config.forced_bias}\n• Status: ${config.paused ? "Paused" : "Active"}`
        });
      } else {
        return NextResponse.json({
          response: `⚠️ Override failed: ${overrideData.message}`
        }, { status: 400 });
      }
    }

    // 4. Otherwise, forward to chat endpoint
    const response = await fetch("http://127.0.0.1:8080/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      const text = await response.text();
      return NextResponse.json({
        response: `⚠️ Agent returned non-JSON response: ${text}`
      }, { status: 500 });
    }

    if (!response.ok) {
      return NextResponse.json({
        response: data.reply || `Agent Server Error: ${response.statusText}`
      }, { status: response.status });
    }

    return NextResponse.json({ 
      response: data.reply 
    });

  } catch (error) {
    console.error("Chat Proxy Error:", error);
    return NextResponse.json({ 
      response: "⚠️ Error: Could not connect to the Alpha Agent (Python). Is 'agent/api.py' running?" 
    }, { status: 500 });
  }
}