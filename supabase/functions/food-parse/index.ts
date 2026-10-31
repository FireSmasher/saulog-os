// Supabase Edge Function: food-parse (Saulog OS next, phase 3).
// Takes a meal photo and/or what he said, returns a draft plate. Never logs anything
// itself: the app shows the draft and he taps Log.
//
// Rules (Edwin, 31 Oct 2026): spoken grams are the truth; the photo only names foods and
// flags what he did not say (oil, sauce) as a guess. Model: Claude Sonnet 5.5 (his pick).
//
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > Via Editor, name
// "food-parse", paste this file. Keep "Enforce JWT verification" ON (only his signed-in
// app may call it). Secret: ANTHROPIC_API_KEY under Edge Functions > Secrets.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'

const MODEL = 'claude-sonnet-5-5'
const MAX_IMAGE_B64 = 2_500_000 // about 1.8 MB of JPEG; the app sends ~200 KB

const CORS = {
  'Access-Control-Allow-Origin': 'https://firesmasher.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `You turn one meal into a list of foods with grams and nutrition per 100 g.
Inputs: maybe a photo of the meal, maybe what the person said, maybe foods already on the plate.

Rules:
- Grams the person said are the truth. Copy them exactly and set grams_said to true. Never change them because the photo looks different.
- The photo is for naming foods and spotting things the person did not mention, such as cooking oil, butter, sauce, dressing or a drink. Add those with your best gram estimate, grams_said false.
- If something was said without grams, estimate the grams from the photo or a normal portion, grams_said false.
- Name foods plainly as they would appear in a food database, in English, with the state when it matters (for example "Rice, cooked", "Chicken breast, raw", "Olive oil").
- Nutrition is per 100 g of the food as eaten, from typical database values. Be realistic; do not round to zero.
- Do not repeat foods listed as already on the plate.
- Use one entry per food. Record the plate with the record_plate tool.`

const TOOL = {
  name: 'record_plate',
  description: 'Record the foods on this plate.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'grams', 'grams_said', 'kcal_100g', 'protein_100g', 'carb_100g', 'fat_100g', 'seen_in_photo'],
          properties: {
            name: { type: 'string' },
            grams: { type: 'number' },
            grams_said: { type: 'boolean' },
            kcal_100g: { type: 'number' },
            protein_100g: { type: 'number' },
            carb_100g: { type: 'number' },
            fat_100g: { type: 'number' },
            seen_in_photo: { type: 'boolean' },
          },
        },
      },
    },
  },
} as const

type Body = { image?: string; transcript?: string; onPlate?: string[] }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'no_key', message: 'ANTHROPIC_API_KEY is not set in Supabase secrets.' }, 503)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_json' }, 400)
  }
  const image = typeof body.image === 'string' ? body.image : ''
  const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 2000) : ''
  const onPlate = Array.isArray(body.onPlate) ? body.onPlate.filter((x) => typeof x === 'string').slice(0, 30) : []
  if (!image && !transcript) return json({ error: 'empty' }, 400)
  if (image.length > MAX_IMAGE_B64) return json({ error: 'image_too_big' }, 413)

  const content: Anthropic.ContentBlockParam[] = []
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } })
  content.push({
    type: 'text',
    text:
      (transcript ? `What I said: "${transcript}"\n` : 'I said nothing; use the photo.\n') +
      (onPlate.length ? `Already on the plate (do not repeat): ${onPlate.join('; ')}\n` : '') +
      'Record the plate.',
  })

  const client = new Anthropic({ apiKey })
  const request = {
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium' as const },
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'auto' as const },
    messages: [{ role: 'user' as const, content }],
  }

  let message: Anthropic.Message | Anthropic.Beta.BetaMessage
  try {
    // Server-side fallback: if Sonnet 5.5 declines, the API retries on another model.
    message = await client.beta.messages.create({
      ...request,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) {
      // The fallback beta was refused: same request without it.
      try {
        message = await client.messages.create(request)
      } catch (e2) {
        return json({ error: 'api', message: String(e2) }, 502)
      }
    } else if (e instanceof Anthropic.AuthenticationError) {
      return json({ error: 'bad_key', message: 'The Anthropic key was refused.' }, 502)
    } else if (e instanceof Anthropic.RateLimitError) {
      return json({ error: 'rate_limited' }, 429)
    } else {
      return json({ error: 'api', message: String(e) }, 502)
    }
  }

  if (message.stop_reason === 'refusal') return json({ error: 'refused' }, 422)
  const call = message.content.find((b) => b.type === 'tool_use' && b.name === 'record_plate')
  if (!call || call.type !== 'tool_use') return json({ error: 'no_plate' }, 502)
  const items = (call.input as { items?: unknown[] }).items ?? []
  return json({ items, model: message.model })
})
