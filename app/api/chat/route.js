/**
 * Chat API — OpenAI lives only on the server.
 * If OPENAI_API_KEY is missing, return a demo reply so the UI still works.
 */

export async function POST(request) {
  const body = await request.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const snippet = lastUser?.content?.trim() || "hello";
    const content = demoReply(snippet);
    console.log("[chat] mode=demo (no OPENAI_API_KEY)");
    console.log("[chat] last user message:\n", snippet);
    console.log("[chat] output:\n", content);
    return Response.json({
      mode: "demo",
      content
    });
  }

  const openaiMessages = [
    {
      role: "system",
      content:
        "You are a thoughtful conversational partner in an HCI research prototype. Be clear, specific, and concise. Do not mention memory extraction unless the user asks."
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];

  console.log("[chat] mode=live model=gpt-4o-mini messages=", openaiMessages.length);
  console.log("[chat] prompt sent to model:\n", JSON.stringify(openaiMessages, null, 2));

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: openaiMessages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI chat error", response.status, err);
      return Response.json({
        mode: "demo",
        content: demoReply(lastUser?.content || ""),
        warning: "OpenAI request failed; using a demo reply."
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "I wasn't able to generate a reply.";
    console.log("[chat] raw choice:\n", JSON.stringify(data.choices?.[0] || null, null, 2));
    console.log("[chat] output:\n", content);
    return Response.json({ mode: "live", content });
  } catch (error) {
    console.error("Chat route failed", error);
    return Response.json({
      mode: "demo",
      content: demoReply(lastUser?.content || "")
    });
  }
}

function demoReply(userText) {
  const clipped = userText.length > 160 ? `${userText.slice(0, 157)}…` : userText;
  return `I'm in **demo mode** (no OpenAI API key). I still reply so you can explore the user model.\n\nYou said: "${clipped}"\n\nOne-off questions usually stay out of the graph. Persistent facts about you may appear as a suggestion. To try a contradiction, say: "Actually, my major is Journalism."`;
}
