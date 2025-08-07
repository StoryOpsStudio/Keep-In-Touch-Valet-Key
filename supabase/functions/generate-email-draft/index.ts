import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface EmailDraftRequest {
  userId: string;
  matchContext: {
    type: 'news' | 'premiere';
    contactName: string;
    articleTitle?: string;
    publication?: string;
    premiereTitle?: string;
    premiereType?: 'movie' | 'tv';
    releaseDate?: string;
    articleUrl?: string; // NEW: For fetching full article content
  };
}

interface AnthropicResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// NEW: Function to fetch and clean article content
async function fetchArticleContent(articleUrl: string): Promise<string> {
  try {
    console.log(`📄 [AI Email Draft] Fetching full article content from: ${articleUrl}`);
    
    // Use our existing CORS proxy function to fetch the article
    const { data, error } = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/cors-proxy?url=${encodeURIComponent(articleUrl)}`, {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      }
    });

    if (error) {
      console.warn(`⚠️ [AI Email Draft] Failed to fetch article via CORS proxy: ${error}`);
      return '';
    }

    const htmlContent = await data.text();
    
    // Basic HTML cleaning - extract text content
    const textContent = htmlContent
      .replace(/<script[^>]*>.*?<\/script>/gis, '') // Remove scripts
      .replace(/<style[^>]*>.*?<\/style>/gis, '') // Remove styles
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Limit to first 3000 characters to stay within AI token limits
    const limitedContent = textContent.substring(0, 3000);
    
    console.log(`✅ [AI Email Draft] Article content extracted: ${limitedContent.length} characters`);
    return limitedContent;
    
  } catch (error) {
    console.warn(`⚠️ [AI Email Draft] Failed to fetch article content: ${error}`);
    return '';
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🤖 [AI Email Draft] Starting enhanced contextual email generation...');

    // Parse request body
    const { userId, matchContext }: EmailDraftRequest = await req.json();

    // Validate required fields
    if (!userId || !matchContext || !matchContext.contactName) {
      throw new Error('Missing required fields: userId, matchContext, or contactName');
    }

    console.log(`📝 [AI Email Draft] Generating contextual email for user ${userId} to contact ${matchContext.contactName}`);

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are required');
    }

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch user's voice profile from the database
    console.log(`👤 [AI Email Draft] Fetching voice profile for user ${userId}...`);
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('voice_profile, full_name')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!profile) {
      throw new Error('User profile not found');
    }

    const voiceProfile = profile.voice_profile || 'Writes casually and warmly. Starts emails with "Hey" or "Hi". Signs off with "Best".';
    const userName = profile.full_name || 'User';

    console.log(`✅ [AI Email Draft] Voice profile retrieved for ${userName}`);

    // Step 2: NEW - Fetch full article content for news matches
    let fullArticleText = '';
    if (matchContext.type === 'news' && matchContext.articleUrl) {
      fullArticleText = await fetchArticleContent(matchContext.articleUrl);
    }

    // Step 3: Construct the ENHANCED UNIVERSAL AI PROMPT
    let contextInfo = '';
    let sourceInfo = '';

    if (matchContext.type === 'news') {
      contextInfo = `- Contact's Name: ${matchContext.contactName}
- Event Type: news
- Title: ${matchContext.articleTitle}
- Source: ${matchContext.publication}`;
      sourceInfo = matchContext.publication || 'industry publication';
    } else if (matchContext.type === 'premiere') {
      const contentType = matchContext.premiereType === 'movie' ? 'movie' : 'TV show';
      contextInfo = `- Contact's Name: ${matchContext.contactName}
- Event Type: premiere
- Title: ${matchContext.premiereTitle}
- Source: Premiere`;
      sourceInfo = 'Premiere';
      // For premieres, create a simple "article" describing the premiere
      fullArticleText = `${matchContext.contactName} has a new ${contentType} titled "${matchContext.premiereTitle}" premiering${matchContext.releaseDate ? ` on ${matchContext.releaseDate}` : ' soon'}. This is an exciting new project for ${matchContext.contactName} in the entertainment industry.`;
    }

    // THE NEW UNIVERSAL AI PROMPT with deep contextual analysis
    const enhancedPrompt = `System Instructions
You are an AI assistant helping entertainment industry professionals draft warm, brief, and human congratulatory or supportive emails to their contacts. Your tone should be casual, friendly, and authentic - like a colleague reaching out to another colleague they genuinely care about.

CRITICAL SAFETY RULE: Before drafting any email, you MUST carefully analyze the context to determine if this is positive news (congratulations appropriate) or negative news (sympathy/support appropriate). Getting this wrong could damage the user's professional relationships.

Input Types
Type 1: News Article Match
When provided with a news article mentioning the contact:

Read the article carefully to understand the context
Determine the sentiment:

POSITIVE: Show renewals, Emmy/award nominations, new project announcements, promotions, deals, positive coverage
NEGATIVE: Show cancellations, firings, controversies, project failures, negative coverage
NEUTRAL: General mentions, interviews, routine announcements


Response Guidelines:

If POSITIVE: Draft a congratulatory email
If NEGATIVE: Draft a supportive/sympathetic email
If NEUTRAL: Draft a friendly check-in email



Type 2: Premiere Match
When provided with information about a premiere/release:

Use the project information provided to understand what type of project it is
If review scores are provided:

GOOD REVIEWS (80%+ RT score or similar): Congratulate on both the launch AND the positive reviews
MIXED/POOR REVIEWS (below 80%): Only wish luck on the launch/premiere


If no review information is provided: Only wish luck on the launch/premiere

Email Drafting Guidelines
Tone and Style

Warm but professional - like texting a work friend
Brief - 2-3 sentences maximum
Specific - reference the actual project/news
Human - avoid corporate speak or overly formal language
Authentic - sound like genuine excitement/support, not forced

Structure Template
Subject Line: Keep it simple and personal

"Congrats on [Project Name]!"
"Saw the news about [Project]"
"[Project] launch!"

Body:

Personal acknowledgment of the news/premiere
Specific congratulation or support based on context
Brief, warm closing

Example Outputs
News Match - Positive Example
Context: Article about contact's show getting renewed for Season 3
Subject: Congrats on the Season 3 renewal!

Hey [Name]! Just saw the news about [Show] getting picked up for another season - that's fantastic! Must feel great to have that momentum going. Hope the writers' room is buzzing with ideas!

Best,
[User Name]

News Match - Negative Example
Context: Article about contact's show being cancelled
Subject: Thinking of you

Hi [Name], saw the news about [Show] and wanted to reach out. I know how much heart you put into that project. The work you did was really special, and I'm sure the right opportunity is just around the corner.

Rooting for you,
[User Name]

Premiere Match - Good Reviews Example
Context: Movie premiering with 85% on Rotten Tomatoes
Subject: [Movie] launch day!

[Name]! Saw [Movie] is out today and the reviews are incredible - 85% on RT! Must be such a rush seeing all that hard work pay off. Hope you're celebrating tonight!

Cheers,
[User Name]

Premiere Match - No Review Info Example
Context: Movie premiering, no review information provided
Subject: [Movie] launch day!

Hey [Name]! Big day with [Movie] hitting theaters. Hope you're proud of all the work that went into bringing this story to life. Launch days are always exciting!

Best,
[User Name]

Safety Guidelines
When in doubt, be conservative:

If you can't clearly determine if news is positive or negative, use neutral language
Better to be slightly less enthusiastic than to congratulate on bad news
Focus on the person's hard work rather than outcomes if uncertain

Before finalizing any email, ask yourself:

Did I correctly identify if this is positive or negative news?
Does my tone match the situation appropriately?
Would I be comfortable receiving this email if I were in their shoes?
Am I being specific enough to show I actually read/understood the context?
Is this brief enough to respect their time?

Variables to Replace

[Name]: Contact's first name
[Project Name] / [Show] / [Movie]: Specific project title
[User Name]: The sender's name

Final Output Format
Provide the email in this format:
Subject: [Subject Line]

[Email Body]

[Closing],
[User Name]

Context Information:
${contextInfo}

${fullArticleText ? `Full Article Content for Analysis:
${fullArticleText}

` : ''}User's Voice Profile: ${voiceProfile}
User's Name: ${userName}

Please analyze the context carefully and generate an appropriate email following the guidelines above.`;

    console.log(`🧠 [AI Email Draft] Sending enhanced contextual prompt to Claude 3 Haiku...`);

    // Step 4: Call Anthropic Claude API with enhanced prompt
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 600, // Increased for more detailed analysis
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: enhancedPrompt
          }
        ]
      })
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('❌ [AI Email Draft] Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${anthropicResponse.status} ${anthropicResponse.statusText}`);
    }

    const anthropicData: AnthropicResponse = await anthropicResponse.json();
    
    if (!anthropicData.content || !anthropicData.content[0] || !anthropicData.content[0].text) {
      throw new Error('Invalid response format from Anthropic API');
    }

    const generatedEmail = anthropicData.content[0].text.trim();

    console.log(`✅ [AI Email Draft] Enhanced contextual email generated successfully (${generatedEmail.length} characters)`);

    // Step 5: Return the generated email with enhanced metadata
    return new Response(
      JSON.stringify({
        success: true,
        emailBody: generatedEmail,
        metadata: {
          contactName: matchContext.contactName,
          matchType: matchContext.type,
          generatedAt: new Date().toISOString(),
          characterCount: generatedEmail.length,
          hasFullArticleContent: fullArticleText.length > 0,
          analysisMethod: 'enhanced-contextual-understanding',
          voiceProfileUsed: true
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ [AI Email Draft] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        emailBody: null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});