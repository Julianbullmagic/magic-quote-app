const express = require('express');
const { OpenAI } = require("openai");
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// ✅ Add body parser with high limits BEFORE any routes
app.use(express.json({
  limit: '5mb',        // Allow large payloads (Base64 images)
  type: 'application/json'
}));

// Serve static files

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASEURL, process.env.SUPABASEKEY);

app.use(express.static('public'));

// Lead extraction function using AI
async function extractLeadWithAI(input) {
    const prompt = `Here is some information about an event copied from a conversation or website "${input}". The date today is ${new Date().toLocaleString("en-US", {timeZone: "Australia/Sydney"})}
    you can assume that the event being discussed is in the future relative to this date.
    I would like you to respond with a JSON array containing an object or objects that each contain properties for crucial lead information.
    Each object in the array should include properties for customer_name, email_address, phone_number, website, price, address, start_time, and end_time (in AEST).
    Also include a short summary in the summary property. If no price is mentioned, the default should be 0. The price should only be a number, without any
    dollar sign. The start_time and end_time should be converted to timestamptz format. There may be a url appended at the end of the information I give you,
    I would like this to be the website property of the object you return. My website, www.Julianbullmagic.com, may be somewhere in the text
    but you can ignore this as it is not the website we are looking for. The information I give you may request several leads.
      There might be a conversation included in which the customer gives updated or more specific details about the event or events, in that
  case you should use this more recent or specific information in your response. In other words, we need the most recent and specific details about
  the lead or leads. The response should be an array of javascript objects,
   nothing else outside this. Include no special characters in the response, essentially it is minified.`;

    const response = await openai.chat.completions.create({
        messages: [{ role: "system", content: prompt }],
        max_tokens: 400,
        model: "gpt-4o-mini",
    });
    
    return JSON.parse(response.choices[0].message.content);
}

// Lead insertion function with deduplication
async function insertLead(leadData) {
    // Check for existing lead and update or insert
    const { data: existingLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('customer_name', leadData.customer_name)
        .eq('num', leadData.num);
    
    if (existingLeads && existingLeads.length > 0) {
        // Update existing lead
        return await supabase
            .from('leads')
            .update(leadData)
            .eq('customer_name', leadData.customer_name)
            .eq('num', leadData.num)
            .select();
    } else {
        // Insert new lead
        return await supabase
            .from('leads')
            .insert([leadData])
            .select();
    }
}

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

// Lead generation endpoint
app.post('/generate-lead', async (req, res) => {
  try {
    const { image, mimeType, textInput } = req.body;

    // Validate input - either image or text must be provided
    if (!image && !textInput) {
      return res.status(400).json({
        error: 'Missing image or text input'
      });
    }

    let leadInput;
    
    if (textInput) {
      // Use text input directly
      leadInput = textInput;
    } else {
      // For image input, we need to extract text using OCR first
      // For now, we'll use a simpler approach with the image analysis prompt
      const ocrPrompt = `Extract all text from this image. Return only the text content without any additional commentary or formatting.`;
      
      const ocrResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: ocrPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      });
      
      leadInput = ocrResponse.choices[0].message.content.trim();
    }

    // Extract lead data using AI
    const leadDataArray = await extractLeadWithAI(leadInput);
    
    // Process each lead
    const results = [];
    for (let i = 0; i < leadDataArray.length; i++) {
      const lead = leadDataArray[i];
      lead.id = uuidv4();
      lead.created_at = new Date().toISOString();
      lead.num = i + 1;
      
      // Store in database
      const result = await insertLead(lead);
      results.push(result);
    }
    
    res.json({
      success: true,
      message: `Successfully created ${leadDataArray.length} lead(s)`,
      leads: results
    });

  } catch (err) {
    console.error("💥 Lead Generation Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Lead generation failed",
        details: err.message
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});