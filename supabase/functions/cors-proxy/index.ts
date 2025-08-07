import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the target URL from query parameters
    const url = new URL(req.url)
    const targetUrl = url.searchParams.get('url')

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required "url" parameter' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Validate the target URL
    let validatedUrl: URL
    try {
      validatedUrl = new URL(targetUrl)
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid URL format' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Security: Only allow specific domains for news sources
    const allowedDomains = [
      'deadline.com',
      'variety.com',
      'hollywoodreporter.com',
      'www.deadline.com',
      'www.variety.com',
      'www.hollywoodreporter.com'
    ]

    if (!allowedDomains.includes(validatedUrl.hostname)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Domain not allowed: ${validatedUrl.hostname}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403 
        }
      )
    }

    console.log(`🔗 CORS Proxy: Fetching ${targetUrl}`)

    // Make the request to the target URL with proper headers
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'Mozilla/5.0 (compatible; KeepInTouchBot/1.0; +https://keepintouch.app)',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })

    if (!response.ok) {
      console.error(`❌ CORS Proxy: HTTP ${response.status} for ${targetUrl}`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `HTTP ${response.status}: ${response.statusText}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status 
        }
      )
    }

    // Get the content
    const content = await response.text()
    console.log(`✅ CORS Proxy: Successfully fetched ${content.length} characters from ${targetUrl}`)

    // Determine content type
    const contentType = response.headers.get('content-type') || 'text/html'

    // Return the content with CORS headers
    return new Response(content, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Length': content.length.toString(),
        'X-Proxy-Source': validatedUrl.hostname,
        'X-Proxy-Status': 'success'
      }
    })

  } catch (error) {
    console.error('❌ CORS Proxy Error:', error)
    
    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Request timeout (30s limit exceeded)' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 408 
        }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown proxy error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})