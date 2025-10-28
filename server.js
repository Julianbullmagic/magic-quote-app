const express = require('express');
const { OpenAI } = require("openai");
require('dotenv').config();

const app = express();

// ✅ Add body parser with high limits BEFORE any routes
app.use(express.json({
  limit: '5mb',        // Allow large payloads (Base64 images)
  type: 'application/json'
}));

// Serve static files

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.static('public'));
app.post('/analyze', async (req, res) => {
  try {
    const { image, mimeType, textInput, promptType = 1 } = req.body;

    // Validate input - either image or text must be provided
    if (!image && !textInput) {
      return res.status(400).json({ 
        error: 'Missing image or text input' 
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let prompt;
    if (textInput) {
      // New prompt for text input
      prompt = `
You are a pricing and response assistant for Julian, a magician in Sydney.

Analyze the following customer inquiry text and extract:
- Customer name
- Event type (wedding, corporate, kids, etc.)
- Date (weekday/weekend)
- Location (suburb, city)
- Any other details

Customer Inquiry:
${textInput}

Then:
1. Calculate a price using:
   - Base: $200 (weekday), $250 (weekend)
   - +$100 for affluent suburbs (e.g., Northern Beaches, Sutherland Shire)
   - +$50 per 25km from Sydney CBD (e.g., Wollongong = +$100)
   -Some of the peripheral suburbs of Sydney are still really far away, please add an
   extra $50 for bookings further away than Penrith, Minto or Mona Vale
   - Wedding → ×1.5
   - Corporate event → Apply multiplier:
     - Small startup → ×1.5
     - Mid-sized company → ×2
     - Large corporation (bank, tech, gov) → ×3
     - Luxury/launch/VIP → ×4
   - Festival (public, arts, community, music) → ×1.5 to 3
     - Base 1.5 for local/community events
     - ×2 for regional or well-funded festivals
     - ×3 for major curated or interstate festivals
     - Consider audience size, exposure, and performance load
2. Generate a natural response (~60 tokens) starting with "Hi {name}," or "Hi,"
   - Mention: $XXX price for 45+ min show
   - Do NOT use "regards", "sincerely", placeholders, or markdown
   Important details to include:
- I can provide a large stage show or roving close-up magic.
- My style: sleight of hand and illusions using everyday objects.
- My name is Julian.
- Do NOT begin with "Greetings" or "Hello!".
- If you can identify a human name in the message, start with "Hi {name},".
- Otherwise, start with "Hi,".
- Always leave a blank line after the greeting.
- NEVER use: "regards", "sincerely", "enchant", brackets [], {}, (), or placeholders.
- Avoid any markdown or formatting.
- Keep tone warm, professional, and slightly playful.
- Do NOT invent details not in the prompt.
-don't end with a sign off please

3. Output ONLY JSON:
   {
     "price": 650,
     "message": "Hi Sarah,\\n\\nI'd love to perform..."
   }

No additional text, explanations, or markdown. Just the JSON object.
`;
    } else {
      // Original prompt for image analysis
      prompt = `
You are a pricing and response assistant for Julian, a magician in Sydney.

Analyze the image and extract:
- Customer name
- Event type (wedding, corporate, kids, etc.)
- Date (weekday/weekend)
- Location (suburb, city)
- Any other details

Then:
1. Calculate a price using:
   - Base: $200 (weekday), $250 (weekend)
   - +$100 for affluent suburbs (e.g., Northern Beaches, Sutherland Shire)
   - +$50 per 25km from Sydney CBD (e.g., Wollongong = +$100)
   -Some of the peripheral suburbs of Sydney are still really far away, please add an
   extra $50 for bookings further away than Penrith, Minto or Mona Vale
   - Wedding → ×1.5
   - Corporate event → Apply multiplier:
     - Small startup → ×1.5
     - Mid-sized company → ×2
     - Large corporation (bank, tech, gov) → ×3
     - Luxury/launch/VIP → ×4
   - Festival (public, arts, community, music) → ×1.5 to 3
     - Base 1.5 for local/community events
     - ×2 for regional or well-funded festivals
     - ×3 for major curated or interstate festivals
     - Consider audience size, exposure, and performance load
2. Generate a natural response (~60 tokens) starting with "Hi {name}," or "Hi,"
   - Mention: $XXX price for 45+ min show
   - Do NOT use "regards", "sincerely", placeholders, or markdown
   Important details to include:
- I can provide a large stage show or roving close-up magic.
- My style: sleight of hand and illusions using everyday objects.
- My name is Julian.
- Do NOT begin with "Greetings" or "Hello!".
- If you can identify a human name in the message, start with "Hi {name},".
- Otherwise, start with "Hi,".
- Always leave a blank line after the greeting.
- NEVER use: "regards", "sincerely", "enchant", brackets [], {}, (), or placeholders.
- Avoid any markdown or formatting.
- Keep tone warm, professional, and slightly playful.
- Do NOT invent details not in the prompt.
-don't end with a sign off please

3. Output ONLY JSON:
   {
     "price": 650,
     "message": "Hi Sarah,\\n\\nI'd love to perform..."
   }

No additional text, explanations, or markdown. Just the JSON object.
`;
    }

    let aiResponse;
    if (textInput) {
      // Handle text input case
      aiResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000
      });
    } else {
      // Handle image input case (existing code)
      console.log("✅ Image received, type:", mimeType);
      console.log("Image size:", image.length, "Base64 characters");

      // Validate Base64 string
      if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(image)) {
        return res.status(400).json({ 
          error: 'Invalid Base64 string' 
        });
      }

      aiResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${image}` // ✅ Correct: starts with `data:`
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      });
    }

    let aiOutput = aiResponse.choices[0].message.content.trim();

    console.log("🤖 Raw AI Output:", aiOutput);

    // Try to extract JSON from the response
    let result;
    try {
      // Try to parse raw output first
      result = JSON.parse(aiOutput);
    } catch (e) {
      // If that fails, try to extract JSON from within ```json ... ```
      const jsonMatch = aiOutput.match(/```json\n([\s\S]*?)\n```/i);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : aiOutput;

      try {
        result = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error("❌ Failed to parse AI response as JSON:", aiOutput);
        return res.status(500).json({ 
          error: "AI returned invalid JSON",
          details: parseError.message 
        });
      }
    }

    // Validate final result
    if (typeof result.price !== 'number' || typeof result.message !== 'string') {
      return res.status(500).json({ 
        error: "AI response missing required fields" 
      });
    }

    // ✅ Success: Send back to client
    res.json(result);

  } catch (err) {
    console.error("💥 Server Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Processing failed", 
        details: err.message 
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});