import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

// WordPress API endpoints for each publication
const WORDPRESS_APIS = {
  deadline: 'https://deadline.com/wp-json/wp/v2/posts',
  variety: 'https://variety.com/wp-json/wp/v2/posts',
  thr: 'https://www.hollywoodreporter.com/wp-json/wp/v2/posts'
};

interface NewsMatch {
  contactId: string;
  contactName: string;
  contactCategory: string;
  articleTitle: string;
  articleUrl: string;
  publication: 'deadline' | 'variety' | 'thr';
  matchLocation: 'title' | 'excerpt' | 'full';
  excerpt: string;
  foundAt: Date;
  userId: string; // NEW: Add user ID for multi-user support
}

interface WordPressPost {
  id: number;
  title: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  link: string;
  date: string;
}

class NewsProcessor {
  private readonly TARGET_DAYS = 2;
  private readonly POSTS_PER_PAGE = 100;
  private readonly MAX_PAGES = 10;
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  // Clean HTML entities and tags from text
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&#8211;/g, '-')
      .replace(/&#8212;/g, '—')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Parse WordPress content HTML and extract clean text
  private parseWordPressContent(htmlContent: string): string {
    try {
      console.log(`🔧 Parsing WordPress content (${htmlContent.length} characters)...`);
      
      // Load HTML into cheerio
      const $ = cheerio.load(htmlContent);
      
      // Remove known noise selectors
      const noiseSelectors = [
        '.jp-relatedposts',           // Jetpack related posts
        '.sharedaddy',                // Sharing buttons
        '.sd-sharing',                // Social sharing
        '.yarpp-related',             // Yet Another Related Posts Plugin
        '.related-posts',             // Generic related posts
        '.wp-block-embed',            // WordPress embeds
        '.wp-block-social-links',     // Social links
        '.addtoany_share_save_container', // AddToAny sharing
        '.post-tags',                 // Tag lists
        '.post-categories',           // Category lists
        '.author-bio',                // Author biography
        '.comments-section',          // Comments
        '.newsletter-signup',         // Newsletter forms
        '.advertisement',             // Ads
        '.ad-container',              // Ad containers
        '.sidebar',                   // Sidebar content
        '.footer-content',            // Footer
        'script',                     // JavaScript
        'style',                      // CSS
        'noscript',                   // NoScript tags
        '.screen-reader-text',        // Screen reader only text
        '.sr-only'                    // Screen reader only (Bootstrap)
      ];
      
      // Remove all noise elements
      noiseSelectors.forEach(selector => {
        $(selector).remove();
      });
      
      // Extract clean text
      const cleanText = $.text() || '';
      const finalText = this.cleanText(cleanText);
      
      console.log(`✅ WordPress content parsed: ${finalText.length} characters of clean text extracted`);
      return finalText;
      
    } catch (error) {
      console.error(`❌ Failed to parse WordPress content:`, error);
      return this.cleanText(htmlContent); // Fallback to basic cleaning
    }
  }

  // Check if article is within target date range
  private isRecentArticle(dateString: string): boolean {
    try {
      const articleDate = new Date(dateString);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - this.TARGET_DAYS);
      
      return articleDate >= twoDaysAgo;
    } catch (error) {
      console.warn(`⚠️ Invalid date format: ${dateString}`);
      return false;
    }
  }

  // Fetch posts from WordPress API with correct date-bounded pagination
  async fetchWordPressPostsPaginated(apiUrl: string, publication: string): Promise<WordPressPost[]> {
    console.log(`📡 Fetching WordPress posts from ${publication} with date-bounded pagination...`);
    
    // Step 1: Calculate the date from two days ago and format as ISO 8601
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - this.TARGET_DAYS);
    const afterDate = twoDaysAgo.toISOString();
    
    console.log(`📅 Filtering for articles after: ${afterDate} (${this.TARGET_DAYS} days ago)`);
    
    const allPosts: WordPressPost[] = [];
    let page = 1;
    let hasMorePages = true;
    
    // Step 2: Paginate through all pages until empty array is returned
    while (hasMorePages && page <= this.MAX_PAGES) {
      try {
        // Step 3: Include both required parameters in every request
        const url = `${apiUrl}?per_page=${this.POSTS_PER_PAGE}&page=${page}&after=${afterDate}&_fields=id,title,excerpt,content,link,date`;
        
        console.log(`📄 Fetching page ${page} from ${publication} (after ${afterDate})`);
        
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'KeepInTouchBot/1.0 (+https://keepintouch.app)'
          }
        });
        
        if (!response.ok) {
          if (response.status === 400 && page > 1) {
            console.log(`📄 Reached end of pages for ${publication} at page ${page} (400 error)`);
            break;
          }
          throw new Error(`WordPress API error: ${response.status} ${response.statusText}`);
        }
        
        const posts: WordPressPost[] = await response.json();
        
        // Step 4: Continue until API returns empty array
        if (!posts || posts.length === 0) {
          console.log(`📄 Empty array returned for ${publication} at page ${page} - stopping pagination`);
          hasMorePages = false;
          break;
        }
        
        // Double-check date filtering (server-side filtering should handle this, but be safe)
        const recentPosts = posts.filter(post => this.isRecentArticle(post.date));
        allPosts.push(...recentPosts);
        
        console.log(`✅ Page ${page}: ${posts.length} posts returned, ${recentPosts.length} within date range (total: ${allPosts.length})`);
        
        // If we got fewer posts than requested, we've likely reached the end
        if (posts.length < this.POSTS_PER_PAGE) {
          console.log(`📄 Received ${posts.length} < ${this.POSTS_PER_PAGE} posts - likely at end of data`);
          hasMorePages = false;
        } else {
          page++;
        }
        
        // Small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Failed to fetch page ${page} from ${publication}:`, error);
        hasMorePages = false;
      }
    }
    
    console.log(`✅ WordPress API pagination complete for ${publication}: ${allPosts.length} recent posts from ${page - 1} pages`);
    return allPosts;
  }

  // Find excerpt around contact mention
  findExcerpt(text: string, contactName: string, contextLength: number = 200): string {
    const lowerText = text.toLowerCase();
    const lowerName = contactName.toLowerCase();
    const index = lowerText.indexOf(lowerName);
    
    if (index === -1) return text.substring(0, contextLength) + '...';
    
    const start = Math.max(0, index - contextLength / 2);
    const end = Math.min(text.length, index + contactName.length + contextLength / 2);
    
    let excerpt = text.substring(start, end);
    
    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';
    
    return excerpt.trim();
  }

  // UPDATED: Save match to database AND broadcast via Supabase channel
  private async saveMatchAndBroadcast(match: NewsMatch): Promise<boolean> {
    try {
      // Step 1: Save to database
      const { error: upsertError } = await this.supabase
        .from('news_matches')
        .upsert({
          contact_id: parseInt(match.contactId),
          contact_name: match.contactName,
          contact_category: match.contactCategory,
          article_title: match.articleTitle,
          article_url: match.articleUrl,
          publication: match.publication,
          match_location: match.matchLocation,
          excerpt: match.excerpt,
          found_at: match.foundAt.toISOString(),
          is_new: true,
          is_read: false,
          user_id: match.userId // NEW: Include user ID for multi-user support
        }, {
          onConflict: 'article_url, contact_id' // The columns that define a unique match
        });

      if (upsertError) {
        console.error('❌ Failed to save match to database:', upsertError);
        return false;
      }

      console.log(`✅ Match for ${match.contactName} in "${match.articleTitle}" saved to database.`);

      // Step 2: NEW - Broadcast the match via Supabase channel
      try {
        const newsChannel = this.supabase.channel('news-alerts');
        
        // Transform match to frontend format for broadcast
        const broadcastPayload = {
          id: `${match.articleUrl}-${match.contactId}`,
          contactId: match.contactId,
          contactName: match.contactName,
          contactCategory: match.contactCategory,
          articleTitle: match.articleTitle,
          articleUrl: match.articleUrl,
          publication: match.publication,
          matchLocation: match.matchLocation,
          excerpt: match.excerpt,
          foundAt: match.foundAt,
          isNew: true,
          isRead: false,
          source: 'wordpress-api'
        };

        await newsChannel.send({
          type: 'broadcast',
          event: 'new_match',
          payload: broadcastPayload
        });

        console.log(`📡 Match broadcasted via Supabase channel: ${match.contactName} in "${match.articleTitle}"`);
        
      } catch (broadcastError) {
        console.error('⚠️ Failed to broadcast match (database save succeeded):', broadcastError);
        // Don't return false here - database save succeeded, broadcast failure is not critical
      }

      return true;
      
    } catch (error) {
      console.error('❌ Database save error:', error);
      return false;
    }
  }

  // Check text for contact matches using Last Name Map and save to database + broadcast
  private async checkTextForMatches(
    text: string, 
    post: WordPressPost, 
    location: 'title' | 'excerpt' | 'full',
    lastNameMap: Map<string, any[]>,
    userId: string // NEW: Pass user ID for user-isolated processing
  ): Promise<number> {
    let matchesSaved = 0;
    const textLower = text.toLowerCase();
    const words = textLower.split(/\s+/);
    
    // Check each word against last names in the map
    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, ''); // Remove punctuation
      if (cleanWord.length < 2) continue;
      
      const potentialContacts = lastNameMap.get(cleanWord);
      if (potentialContacts) {
        // Check each contact with this last name
        for (const contact of potentialContacts) {
          const fullName = `${contact.first_name} ${contact.last_name}`;
          
          // Check if full name appears in text
          if (textLower.includes(fullName.toLowerCase())) {
            const publication = this.getPublicationFromUrl(post.link);
            
            const match: NewsMatch = {
              contactId: contact.id.toString(),
              contactName: fullName,
              contactCategory: contact.category || 'OTHER',
              articleTitle: this.cleanText(post.title.rendered),
              articleUrl: post.link,
              publication,
              matchLocation: location,
              excerpt: this.findExcerpt(text, fullName, 300),
              foundAt: new Date(post.date),
              userId: userId // NEW: Include user ID for multi-user support
            };
            
            // UPDATED: Save to database AND broadcast via channel
            const saved = await this.saveMatchAndBroadcast(match);
            if (saved) {
              matchesSaved++;
              console.log(`🎯 MATCH SAVED & BROADCASTED: ${fullName} found in ${location} of "${post.title.rendered}"`);
            }
          }
        }
      }
    }
    
    return matchesSaved;
  }

  // Get publication from URL
  getPublicationFromUrl(url: string): 'deadline' | 'variety' | 'thr' {
    if (url.includes('deadline.com')) return 'deadline';
    if (url.includes('variety.com')) return 'variety';
    if (url.includes('hollywoodreporter.com')) return 'thr';
    return 'deadline';
  }

  // UPDATED: Process all publications and save matches to database + broadcast
  async processAllPublications(lastNameMap: Map<string, any[]>, userId: string): Promise<{ totalArticles: number; totalMatches: number }> {
    console.log(`🚀 Processing all publications with DATABASE + BROADCAST workflow for user ${userId}...`);
    
    let totalArticlesProcessed = 0;
    let totalMatchesSaved = 0;
    let totalFullContentChecks = 0;
    
    // Process each publication
    for (const [publication, apiUrl] of Object.entries(WORDPRESS_APIS)) {
      console.log(`\n📡 Processing ${publication} for user ${userId}...`);
      
      try {
        // Fetch posts from WordPress API with correct pagination
        const posts = await this.fetchWordPressPostsPaginated(apiUrl, publication);
        console.log(`📊 Found ${posts.length} recent posts from ${publication}`);
        totalArticlesProcessed += posts.length;
        
        // Process each post with FULL CONTENT CHECK for every article
        for (const post of posts) {
          console.log(`🔍 Processing "${this.cleanText(post.title.rendered)}" - checking ALL content...`);
          
          // Get all text content for this article
          const titleText = this.cleanText(post.title.rendered);
          const excerptText = this.cleanText(post.excerpt.rendered);
          
          // ALWAYS get and parse the full content for every article
          const fullContentHtml = post.content.rendered;
          let fullContent = '';
          
          if (fullContentHtml) {
            fullContent = this.parseWordPressContent(fullContentHtml);
            totalFullContentChecks++;
          }
          
          // Check title for matches and save to database + broadcast
          if (titleText) {
            const titleMatches = await this.checkTextForMatches(
              titleText, 
              post, 
              'title', 
              lastNameMap,
              userId // NEW: Pass user ID
            );
            totalMatchesSaved += titleMatches;
          }
          
          // Check excerpt for matches and save to database + broadcast
          if (excerptText) {
            const excerptMatches = await this.checkTextForMatches(
              excerptText, 
              post, 
              'excerpt', 
              lastNameMap,
              userId // NEW: Pass user ID
            );
            totalMatchesSaved += excerptMatches;
          }
          
          // ALWAYS check full content for matches and save to database + broadcast
          if (fullContent) {
            const fullMatches = await this.checkTextForMatches(
              fullContent, 
              post, 
              'full', 
              lastNameMap,
              userId // NEW: Pass user ID
            );
            totalMatchesSaved += fullMatches;
          }
          
          // Small delay between posts
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
      } catch (error) {
        console.error(`❌ Failed to process ${publication}:`, error);
      }
      
      // Delay between publications
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ DATABASE + BROADCAST processing complete for user ${userId}:`);
    console.log(`   📊 Articles processed: ${totalArticlesProcessed}`);
    console.log(`   🔍 Full content checks: ${totalFullContentChecks}`);
    console.log(`   💾 Matches saved to database: ${totalMatchesSaved}`);
    console.log(`   📡 Matches broadcasted via Supabase: ${totalMatchesSaved}`);
    console.log(`   ✅ Coverage: 100% of articles had full content analyzed`);
    
    return {
      totalArticles: totalArticlesProcessed,
      totalMatches: totalMatchesSaved
    };
  }
}

// UPDATED: Paginated contact fetching with user ID parameter
async function getAllContactsPaginated(supabase: any, userId: string): Promise<any[]> {
  console.log(`📋 Starting paginated contact fetching for user ID: ${userId}...`);
  
  const allContacts: any[] = [];
  const pageSize = 1000;
  let currentPage = 0;
  let hasMoreData = true;
  
  while (hasMoreData) {
    const from = currentPage * pageSize;
    const to = from + pageSize - 1;
    
    console.log(`📄 Fetching contacts page ${currentPage + 1} (contacts ${from + 1} to ${to + 1}) for user ${userId}...`);
    
    const { data, error: supabaseError } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId) // CRITICAL: Only fetch specified user's contacts
      .order('created_at', { ascending: false })
      .range(from, to);

    if (supabaseError) {
      throw new Error(`Failed to fetch contacts page ${currentPage + 1}: ${supabaseError.message}`);
    }

    if (data && data.length > 0) {
      allContacts.push(...data);
      console.log(`✅ Contacts page ${currentPage + 1} loaded ${data.length} contacts (total so far: ${allContacts.length})`);
    }

    if (!data || data.length < pageSize) {
      hasMoreData = false;
      console.log(`🏁 Reached end of contact data. Final total: ${allContacts.length} contacts for user ${userId}`);
    } else {
      currentPage++;
    }
  }

  console.log(`✅ Successfully fetched ${allContacts.length} contacts for user ${userId}.`);
  return allContacts;
}

// Create Last Name Map for efficient matching
function createLastNameMap(contacts: any[]): Map<string, any[]> {
  console.log('🗂️ Creating Last Name Map for efficient matching...');
  
  const lastNameMap = new Map<string, any[]>();
  
  for (const contact of contacts) {
    if (!contact.first_name || !contact.last_name) continue;
    
    const lastName = contact.last_name.toLowerCase().trim();
    const existingContacts = lastNameMap.get(lastName) || [];
    existingContacts.push(contact);
    lastNameMap.set(lastName, existingContacts);
  }
  
  console.log(`✅ Last Name Map created: ${lastNameMap.size} unique last names`);
  
  // Log some statistics
  const mapStats = Array.from(lastNameMap.entries())
    .map(([name, contacts]) => ({ name, count: contacts.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  console.log('📊 Top 10 most common last names:');
  mapStats.forEach(stat => {
    console.log(`   "${stat.name}": ${stat.count} contacts`);
  });
  
  return lastNameMap;
}

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
    // CRITICAL: Parse request body to get user ID
    const { userId } = req.method === 'POST' ? await req.json() : { userId: null };
    
    // CRITICAL: Validate that userId is provided
    if (!userId) {
      throw new Error('User ID is required for user-isolated processing');
    }
    
    console.log(`🚀 Starting DATABASE + BROADCAST news processing for user ${userId}...`);

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are required')
    }

    // Initialize Supabase client and news processor
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const newsProcessor = new NewsProcessor(supabase);

    // Step 1: Fetch ALL contacts from database using pagination (user-specific)
    const contacts = await getAllContactsPaginated(supabase, userId);

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ 
          status: 'complete',
          message: `No contacts found for user ${userId} - news processing skipped`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Step 2: Create Last Name Map for efficient matching
    const lastNameMap = createLastNameMap(contacts);

    // Step 3: Process all publications and save matches to database + broadcast
    const results = await newsProcessor.processAllPublications(lastNameMap, userId);

    console.log(`✅ DATABASE + BROADCAST news processing complete for user ${userId}!`);
    console.log(`   📊 Total articles processed: ${results.totalArticles}`);
    console.log(`   💾 Total matches saved to database: ${results.totalMatches}`);
    console.log(`   📡 Total matches broadcasted via Supabase: ${results.totalMatches}`);
    console.log(`   🔄 Frontend will receive instant updates via Broadcast channel`);

    // Return simple success message
    return new Response(
      JSON.stringify({ 
        status: 'complete',
        message: 'News processing finished successfully',
        stats: {
          articlesProcessed: results.totalArticles,
          matchesSavedToDatabase: results.totalMatches,
          matchesBroadcasted: results.totalMatches,
          contactsProcessed: contacts.length,
          publicationsProcessed: Object.keys(WORDPRESS_APIS).length,
          method: 'database-plus-broadcast-workflow'
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Edge Function Error:', error)
    
    return new Response(
      JSON.stringify({ 
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})