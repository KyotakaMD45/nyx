// AI assistant: Gemini (GEMINI_API_KEY) first, otherwise Groq (GROQ_API_KEY).
// Reply to a message to give it as context; reply to an image to ask about it (Gemini).
const { bot, lang, config } = require('../lib')

const SYSTEM = (name) =>
  `Tu es ${name}, un assistant WhatsApp. Réponds de façon claire et concise, dans la langue de l'utilisateur. ` +
  'Utilise le formatage WhatsApp (*gras*, _italique_) avec modération.'

async function askGemini(prompt, image) {
  const parts = [{ text: prompt }]
  if (image) parts.push({ inline_data: { mime_type: image.mimetype, data: image.data.toString('base64') } })
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM(config.BOT_NAME) }] },
      contents: [{ role: 'user', parts }],
    }),
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`)
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim()
}

async function askGroq(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: config.GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM(config.BOT_NAME) },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `Groq HTTP ${res.status}`)
  return (data.choices?.[0]?.message?.content || '').trim()
}

bot(
  {
    pattern: 'ai ?(.*)',
    alias: ['gemini', 'gpt'],
    desc: lang.plugins.ai.desc,
    type: 'ai',
    fromMe: false,
  },
  async (message, match) => {
    if (!config.GEMINI_API_KEY && !config.GROQ_API_KEY) return message.reply(lang.plugins.ai.no_key)
    const quoted = message.reply_message
    let prompt = (match || '').trim()
    if (quoted?.text) prompt = prompt ? `${prompt}\n\n« ${quoted.text} »` : quoted.text
    const wantsImage = !!(quoted?.image || message.image)
    if (!prompt && !wantsImage) return message.reply(lang.plugins.ai.usage)

    await message.react('⏳').catch(() => {})
    let answer
    if (config.GEMINI_API_KEY) {
      const image = wantsImage
        ? { data: await (message.image ? message : quoted).download(), mimetype: (message.image ? message : quoted).mimetype || 'image/jpeg' }
        : null
      answer = await askGemini(prompt || lang.plugins.ai.describe, image)
    } else {
      if (wantsImage && !prompt) return message.reply(lang.plugins.ai.image_needs_gemini)
      answer = await askGroq(prompt)
    }
    await message.react('').catch(() => {})
    await message.reply(answer || lang.plugins.ai.empty)
  }
)
