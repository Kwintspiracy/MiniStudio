import { serve } from "std/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FEEDBACK_RECIPIENT_EMAIL = Deno.env.get('FEEDBACK_RECIPIENT_EMAIL') || 'quentinbeau@gmail.com'

// SEC-6 + CORS: Restrict CORS to allowed origins
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// SEC-7: HTML escape helper to prevent XSS in email body
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { feedback, userEmail } = await req.json()

    if (!feedback) {
      return new Response(
        JSON.stringify({ error: 'Feedback message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not set')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const safeFeedback = escapeHtml(String(feedback))
    const safeUserEmail = userEmail ? escapeHtml(String(userEmail)) : 'Anonymous'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'MiniStudio <onboarding@resend.dev>',
        to: FEEDBACK_RECIPIENT_EMAIL,
        subject: 'New Feedback from MiniStudio',
        html: `
          <h3>New Feedback Received</h3>
          <p><strong>User Email:</strong> ${safeUserEmail}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${safeFeedback}</p>
        `,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(data)}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Feedback sent successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
