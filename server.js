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
const { image, mimeType, promptType = 1 } = req.body;

    // Validate input
    if (!image || !mimeType) {
      return res.status(400).json({ 
        error: 'Missing image or MIME type' 
      });
    }

    console.log("✅ Image received, type:", mimeType);
    console.log("Image size:", image.length, "Base64 characters");

    // Validate Base64 string
    if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(image)) {
      return res.status(400).json({ 
        error: 'Invalid Base64 string' 
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
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
   - +$50 per 50km from Sydney CBD (e.g., Wollongong = +$100)
   - ×1.5 for weddings, ×2.5–×8 for corporate (depending on how big a successful the company is)
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

3. Output ONLY JSON:
   {
     "price": 650,
     "message": "Hi Sarah,\\n\\nI'd love to perform..."
   }

No additional text, explanations, or markdown. Just the JSON object.
`;

    const aiResponse = await openai.chat.completions.create({
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

    const aiOutput = aiResponse.choices[0].message.content.trim();

        if (promptType==1){
    aiOutput+=`\n\nCould you give me a rough idea of the number of people attending? This helps me determine the size of the tricks I can do and whether I need amplification. Will there be loud music?`;

  aiOutput+=`\n\nIf you have any other requirements like insurance, please let me know before booking. Also, I need to know the exact time and suburb before booking so I can check if I'm free and calculate travel times between bookings. Please check if I'm still available — someone else may have booked me since this offer.`;

  aiOutput+=`\n\nIf you're a booking agent or booking on behalf of someone else, I'll give you 20% commission on top of my fee — I just need to verify this with the customer. I also offer commission if you sell tickets to my show (after expenses).`;

  aiOutput+=`\n\nI'm open to reciprocal social media promotion on Instagram or Facebook — it might help hype your event! My Instagram is @julianbullmagic and has a decent following.`;
    }
    if (promptType==2){
        aiOutput=aiOutput+"\n\nCould you give me a rough idea of the number of people attending? This helps me determine the size of the tricks I can do and whether I need amplification. Will there be loud music?"
aiOutput=aiOutput+"\n\nIf you have any other requirements like insurance, please let me know before booking. Also I need to know the exact time and suburb before booking so I can check if I am free and the travel times between the bookings.\n\nPlease check if I am still available before booking, some time may have elapsed since I made this initial offer and someone else may have booked me in that time."
let prefix="PLEASE READ THIS BEFORE BOOKING \n\n"
aiOutput=prefix+aiOutput
    }
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