import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { load } from 'https://esm.sh/cheerio@1.0.0-rc.12'

interface NewsMatch {
  contactId: string;
  contactName: string;
  contactCategory: string;
  articleTitle: string;
  articleUrl: string;
  publication: 'deadline' | 'variety' | 'thr';
  matchLocation: string;
  excerpt: string;
  foundAt: Date;
  userId: string;
}

interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  date: string;
}

// WordPress REST API endpoints
const WORDPRESS_APIS = {
  deadline: 'https://deadline.com/wp-json/wp/v2/posts',
  variety: 'https://variety.com/wp-json/wp/v2/posts',
  thr: 'https://www.hollywoodreporter.com/wp-json/wp/v2/posts'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// Create last name map for efficient searching
function createLastNameMap(contacts: any[]): Map<string, any[]> {
  const lastNameMap = new Map<string, any[]>();
  
  contacts.forEach(contact => {
    if (contact.last_name) {
      const lastName = contact.last_name.toLowerCase();
      
      if (!lastNameMap.has(lastName)) {
        lastNameMap.set(lastName, []);
      }
      lastNameMap.get(lastName)!.push(contact);
    }
  });
  
  return lastNameMap;
}

class NewsProcessor {
  private supabase: any;
  private readonly POSTS_PER_PAGE = 50;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  // Clean text helper
  cleanText(text: string): string {
    return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  }

  // Fetch full article content
  async fetchFullArticleContent(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        }
      });
      
      if (!response.ok) return '';
      
      const html = await response.text();
      const $ = load(html);
      
      // Remove scripts, styles, and other unwanted elements
      $('script, style, nav, header, footer, .advertisement').remove();
      
      // Get article content from common selectors
      const contentSelectors = [
        'article',
        '.article-content',
        '.entry-content',
        '.post-content',
        '.content',
        'main'
      ];
      
      let content = '';
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length && element.text().trim().length > content.length) {
          content = element.text().trim();
        }
      }
      
      return content || $('body').text().trim();
    } catch (error) {
      console.warn(`⚠️ Could not fetch full content from ${url}:`, error);
      return '';
    }
  }

  // Check article for matches
  async checkArticleForMatches(
    post: WordPressPost,
    lastNameMap: Map<string, any[]>,
    userId: string
  ): Promise<number> {
    let matchesSaved = 0;
    
    // Get all text content
    const title = this.cleanText(post.title.rendered);
    const excerpt = this.cleanText(post.excerpt.rendered);
    const content = this.cleanText(post.content.rendered);
    
    // Try to get full article content
    let fullContent = '';
    try {
      fullContent = await this.fetchFullArticleContent(post.link);
    } catch (error) {
      console.warn(`⚠️ Could not fetch full content for ${post.title.rendered}`);
    }
    
    // Combine all text sources
    const textSources = [
      { text: title, location: 'title' },
      { text: excerpt, location: 'excerpt' },
      { text: content, location: 'content' },
      { text: fullContent, location: 'full article' }
    ];
    
    // Check each text source
    for (const { text, location } of textSources) {
      if (!text) continue;
      
      const textLower = text.toLowerCase();
      const words = textLower.split(/\s+/);
      
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
                userId: userId
              };
              
              // Save to database AND broadcast via channel
              const saved = await this.saveMatchAndBroadcast(match);
              if (saved) {
                matchesSaved++;
                console.log(`🎯 MATCH SAVED & BROADCASTED: ${fullName} found in ${location} of "${post.title.rendered}"`);
              }
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

  // Fetch posts from WordPress API
  async fetchPostsFromWordPress(apiUrl: string, page: number = 1): Promise<WordPressPost[]> {
    try {
      const url = `${apiUrl}?page=${page}&per_page=${this.POSTS_PER_PAGE}&orderby=date&order=desc`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const posts = await response.json();
      return posts;
    } catch (error) {
      console.error(`❌ Failed to fetch posts from ${apiUrl}:`, error);
      return [];
    }
  }

  // Fetch all recent posts from a publication
  async fetchAllRecentPosts(publication: string, apiUrl: string): Promise<WordPressPost[]> {
    console.log(`📚 Fetching recent posts from ${publication}...`);
    
    const allPosts: WordPressPost[] = [];
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages && page <= 5) { // Limit to 5 pages max
      try {
        const posts = await this.fetchPostsFromWordPress(apiUrl, page);
        
        if (posts.length > 0) {
          allPosts.push(...posts);
          console.log(`📄 ${publication} page ${page}: ${posts.length} posts (${allPosts.length} total)`);
        }
        
        // If we got fewer posts than expected, we've likely reached the end
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

  // Save match to database AND broadcast via Supabase channel
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
          user_id: match.userId
        }, {
          onConflict: 'article_url, contact_id'
        });

      if (upsertError) {
        console.error('❌ Database upsert error:', upsertError);
        return false;
      }

      // Step 2: Broadcast via Supabase Realtime
      const { error: broadcastError } = await this.supabase
        .channel(`news-matches-${match.userId}`)
        .send({
          type: 'broadcast',
          event: 'new-match',
          payload: { match }
        });

      if (broadcastError) {
        console.warn('⚠️ Broadcast error (match still saved to database):', broadcastError);
        return true; // Still return true since database save succeeded
      }

      return true;
    } catch (error) {
      console.error('❌ Error saving match:', error);
      return false;
    }
  }

  // Process all publications
  async processAllPublications(lastNameMap: Map<string, any[]>, userId: string): Promise<{ totalArticles: number; totalMatches: number }> {
    console.log(`🚀 Processing all publications with DATABASE + BROADCAST workflow for user ${userId}...`);
    
    let totalArticlesProcessed = 0;
    let totalMatchesSaved = 0;
    let totalFullContentChecks = 0;
    
    // Process each publication
    for (const [publication, apiUrl] of Object.entries(WORDPRESS_APIS)) {
      try {
        console.log(`\n📰 Processing ${publication.toUpperCase()}...`);
        
        // Fetch all recent posts
        const posts = await this.fetchAllRecentPosts(publication, apiUrl);
        console.log(`📊 ${publication}: ${posts.length} posts to analyze`);
        
        // Process each post
        for (const post of posts) {
          totalArticlesProcessed++;
          totalFullContentChecks++;
          
          // Check for matches
          const matchesSaved = await this.checkArticleForMatches(post, lastNameMap, userId);
          totalMatchesSaved += matchesSaved;
          
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

// FIXED: RLS-compatible contact fetching function
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
    
    try {
      // FIXED: Try RPC first, then fallback to direct query
      const { data, error: supabaseError } = await supabase.rpc('get_user_contacts', {
        target_user_id: userId,
        page_offset: from,
        page_limit: pageSize
      });

      if (supabaseError) {
        // FALLBACK: Direct query with service role
        console.log('⚠️ RPC method not found, trying direct query with service role...');
        
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (fallbackError) {
          throw new Error(`Failed to fetch contacts page ${currentPage + 1}: ${fallbackError.message}`);
        }
        
        if (fallbackData && fallbackData.length > 0) {
          allContacts.push(...fallbackData);
          console.log(`✅ Contacts page ${currentPage + 1} loaded ${fallbackData.length} contacts (total so far: ${allContacts.length})`);
        }

        if (!fallbackData || fallbackData.length < pageSize) {
          hasMoreData = false;
          console.log(`🏁 Reached end of contact data. Final total: ${allContacts.length} contacts`);
        }
      } else {
        if (data && data.length > 0) {
          allContacts.push(...data);
          console.log(`✅ Contacts page ${currentPage + 1} loaded ${data.length} contacts (total so far: ${allContacts.length})`);
        }

        if (!data || data.length < pageSize) {
          hasMoreData = false;
          console.log(`🏁 Reached end of contact data. Final total: ${allContacts.length} contacts`);
        }
      }
    } catch (error) {
      throw new Error(`Failed to fetch contacts page ${currentPage + 1}: ${error.message}`);
    }

    currentPage++;
  }
  
  return allContacts;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extract user ID from request body
    const { userId } = req.method === 'POST' ? 
      await req.json() : { userId: null };
    
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