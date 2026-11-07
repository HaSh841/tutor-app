/* global process */
// Vercel runs this as a server function at /api/ai/chat/completions.
// It forwards the chat to Gemini and keeps the AI key on the server.

export const config = { maxDuration: 60 };   // pictures can take a while

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const key = process.env.AI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'AI_API_KEY is not set on Vercel' });
    return;
  }

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        // only pass on what the app needs
        body: JSON.stringify({
          model: req.body?.model,
          messages: req.body?.messages,
        }),
      }
    );

    const text = await upstream.text();
    res
      .status(upstream.status)
      .setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
      .send(text);
  } catch {
    res.status(502).json({ error: 'Could not reach the AI service' });
  }
}