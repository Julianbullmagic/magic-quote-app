const express = require('express');
const multer = require('multer');
const { OpenAI } = require('openai');

const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Set up multer for file upload
const upload = multer({ dest: 'uploads/' });

// Serve static files
app.use(express.static('public'));

// POST /analyze - Accept image, return AI response
app.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const imagePath = req.file.path;

  try {
    // Use OpenAI Vision API to analyze image
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `
You are a pricing and response assistant for Julian, a top magician in Sydney.

Analyze the image and extract:
- Customer name (if visible)
- Event type (wedding, corporate, kids, etc.)
- Date (weekday/weekend)
- Location (suburb, city)
- Any other details (group size, special requests)

Then:
1. Calculate a price using:
   - Base: $200 (weekday), $250 (weekend)
   - +$100 for affluent suburbs (e.g., Northern Beaches, Sutherland Shire)
   - +$50 per 50km from Sydney CBD (e.g., Wollongong = +$100)
   - ×1.5 for weddings, ×2.5–×8 for corporate (based on company size)
2. Generate a natural response (~60 tokens) starting with "Hi {name}," or "Hi,"
   - Mention: $XXX price for 45+ min show, need for headcount/suburb/time
   - Add follow-up questions and commission offer
   - Do NOT use "regards", "sincerely", placeholders, or markdown
3. Output JSON:
   {
     "price": 650,
     "message": "Hi Sarah,\\n\\nI'd love to perform..."
   }
              `
            },
            {
              type: 'image_file',
              image_file: imagePath,
            }
          ]
        }
      ],
      max_tokens: 1000,
    });

    const aiOutput = response.choices[0].message.content;

    // Extract JSON from response
    const jsonMatch = aiOutput.match(/```json\n([\s\S]*?)\n```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : aiOutput;

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (err) {
      console.error("Failed to parse AI JSON:", jsonStr);
      return res.status(500).json({ error: "AI response parsing failed" });
    }

    res.json(result);

  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ error: "Failed to process image" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});