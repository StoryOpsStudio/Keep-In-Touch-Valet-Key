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
  matchLocation: 'title' | 'excerpt' | 'content' | 'full';
  excerpt: string;
  foundAt: Date;
  userId: string;
}

interface WordPressPost {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  link: string;
  date: string;
}

const WORDPRESS_APIS = {
  deadline: 'https://deadline.com/wp-json/wp/v2/posts',
  variety: 'https://variety.com/wp-json/wp/v2/posts',
  thr: 'https://www.hollywoodreporter.com/wp-json/wp/v2/posts'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ---------- helpers ----------

function createLastNameMap(contacts: any[]): Map<string, any[]> {
  const lastNameMap = new Map<string, any[]>();
  for (const c of contacts) {
    if (!c.first_name || !c.last_name) continue;
    const last = String(c.last_name).toLowerCase().trim();
    if (!lastNameMap.has(last)) lastNameMap.set(last, []);
    lastNameMap.get(last)!.push(c);
  }
  return lastNameMap;
}

class NewsProcessor {
  private supabase: any;
  private readonly TARGET_DAYS = 2;    // scan last 48h
  private readonly POSTS_PER_PAGE = 100;
  private readonly MAX_PAGES = 10;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  cleanText(text: string): string {
    return (text || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[^;]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Strip page cruft from WP HTML (keeps article body clean)
  private parseWordPressContent(htmlContent: string): string {
    try {
      const $ = load(htmlContent || '');
      const noiseSelectors = [
        '.jp-relatedposts','.sharedaddy','.sd-sharing','.yarpp-related','.related-posts',
        '.wp-block-embed','.wp-block-social-links','.addtoany_share_save_container',
        '.post-tags','.post-categories','.author-bio','.comments-section',
        '.newsletter-signup','.advertisement','.ad-container','.sidebar','.footer-content',
        'script','style','noscript','.screen-reader-text','.sr-only'
      ];
      noiseSelectors.forEach(sel => $(sel).remove());
      return this.cleanText($.text() || '');
    } catch {
      return this.cleanText(htmlContent || '');
    }
  }

  private getPublicationFromUrl(url: string): 'deadline' | 'variety' | 'thr' {
    if (url.includes('deadline.com')) return 'deadline';
    if (url.includes('variety.com')) return 'variety';
    if (url.includes('hollywoodreporter.com')) return 'thr';
    return 'deadline';
  }

  // WordPress pagination with a date window + only needed fields
  async fetchWordPressPostsPaginated(apiUrl: string, publication: string): Promise<WordPressPost[]> {
    const twoDaysAgo = new Date(Date.now() - this.TARGET_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const posts: WordPressPost[] = [];
    const seen = new Set<number>();
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= this.MAX_PAGES) {
      const url = `${apiUrl}?per_page=${this.POSTS_PER_PAGE}&page=${page}` +
                  `&after=${encodeURIComponent(twoDaysAgo)}` +
                  `&_fields=id,title,excerpt,content,link,date`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'KeepInTouchBot/1.0' }
      });

      if (!res.ok) {
        // Some WP sites return 400 when you go past last page – treat as end.
        if (res.status === 400 && page > 1) break;
        console.error(`❌ Failed ${publication} page ${page}: ${res.status} ${res.statusText}`);
        break;
      }

      const pagePosts: WordPressPost[] = await res.json();
      if (!pagePosts || pagePosts.length === 0) break;

      for (const p of pagePosts) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          posts.push(p);
        }
      }

      if (pagePosts.length < this.POSTS_PER_PAGE) hasMore = false;
      page++;
      await new Promise(r => setTimeout(r, 500)); // be polite
    }

    return posts;
  }

  // Build an excerpt around the first name hit
  private findExcerpt(sourceText: string, contactName: string, context = 300): string {
    const text = sourceText || '';
    const lower = text.toLowerCase();
    const needle = contactName.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx < 0) return text.slice(0, context) + (text.length > context ? '…' : '');
    const start = Math.max(0, idx - Math.floor(context / 2));
    const end = Math.min(text.length, idx + needle.length + Math.floor(context / 2));
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }

  // One save+broadcast per contact+article (choose best location)
  private async saveMatchAndBroadcast(match: NewsMatch): Promise<boolean> {
    try {
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
        }, { onConflict: 'article_url, contact_id' });

      if (upsertError) {
        console.error('❌ Database upsert error:', upsertError);
        return false;
      }

      // Per-user channel
      const { error: broadcastError } = await this.supabase
        .channel(`news-matches-${match.userId}`)
        .send({ type: 'broadcast', event: 'new-match', payload: { match } });

      if (broadcastError) console.warn('⚠️ Broadcast error (saved anyway):', broadcastError);
      return true;
    } catch (e) {
      console.error('❌ Error saving match:', e);
      return false;
    }
  }

  // Scan one post (dedup per contact, pick best location)
  async checkArticleForMatches(
    post: WordPressPost,
    lastNameMap: Map<string, any[]>,
    userId: string
  ): Promise<number> {
    // Prepare sources (use WP content as "full")
    const title = this.cleanText(post.title?.rendered || '');
    const excerpt = this.cleanText(post.excerpt?.rendered || '');
    const full = this.parseWordPressContent(post.content?.rendered || '');

    const sources = [
      { key: 'title' as const, text: title },
      { key: 'excerpt' as const, text: excerpt },
      { key: 'content' as const, text: this.cleanText(post.content?.rendered || '') }, // WP rendered, no extra HTTP
      { key: 'full' as const, text: full }
    ];

    // Build a unique vocabulary once, then intersect with last names
    const combinedLower = sources.map(s => (s.text || '').toLowerCase()).join(' ');
    const uniqueWords = new Set(combinedLower.split(/\W+/).filter(w => w.length >= 2));
    const candidateLastNames: string[] = [];
    for (const w of uniqueWords) if (lastNameMap.has(w)) candidateLastNames.push(w);

    const publication = this.getPublicationFromUrl(post.link);
    const alreadySaved = new Set<string>(); // contact.id per article
    let saved = 0;

    // Helper to choose the best label for UI
    const chooseLocation = (fullNameLower: string) => {
      // priority: title > excerpt > content > full
      for (const s of sources) {
        if ((s.text || '').toLowerCase().includes(fullNameLower)) return s.key;
      }
      return 'full' as const;
    };

    for (const last of candidateLastNames) {
      const potentials = lastNameMap.get(last)!;
      for (const contact of potentials) {
        const cid = String(contact.id);
        if (alreadySaved.has(cid)) continue;

        const fullName = `${contact.first_name} ${contact.last_name}`;
        const fullNameLower = fullName.toLowerCase();

        // Any source contains the full name?
        if (!combinedLower.includes(fullNameLower)) continue;

        const bestKey = chooseLocation(fullNameLower);
        const bestSource = sources.find(s => s.key === bestKey)?.text || full;

        const match: NewsMatch = {
          contactId: cid,
          contactName: fullName,
          contactCategory: contact.category || 'OTHER',
          articleTitle: this.cleanText(post.title?.rendered || ''),
          articleUrl: post.link,
          publication,
          matchLocation: bestKey,
          excerpt: this.findExcerpt(bestSource, fullName, 300),
          foundAt: new Date(post.date),
          userId
        };

        const ok = await this.saveMatchAndBroadcast(match);
        if (ok) {
          alreadySaved.add(cid);
          saved++;
          console.log(`🎯 MATCH SAVED & BROADCASTED: ${fullName} in ${bestKey} of "${this.cleanText(post.title?.rendered || '')}"`);
        }
      }
    }

    return saved;
  }

  async processAllPublications(lastNameMap: Map<string, any[]>, userId: string) {
    let totalArticles = 0;
    let totalMatches = 0;

    for (const [pub, api] of Object.entries(WORDPRESS_APIS)) {
      try {
        console.log(`\n📰 Fetching ${pub.toUpperCase()} (last ${this.TARGET_DAYS} days)…`);
        const posts = await this.fetchWordPressPostsPaginated(api, pub);
        console.log(`📊 ${pub}: ${posts.length} posts`);

        for (const post of posts) {
          totalArticles++;
          totalMatches += await this.checkArticleForMatches(post, lastNameMap, userId);
          await new Promise(r => setTimeout(r, 50)); // small yield
        }
      } catch (e) {
        console.error(`❌ Failed ${pub}:`, e);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`✅ Done. Articles: ${totalArticles} | Matches: ${totalMatches}`);
    return { totalArticles, totalMatches };
  }
}

// Same as your current version (keeps RLS safety + pagination)
async function getAllContactsPaginated(supabase: any, userId: string): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 1000;
  let page = 0;
  let more = true;

  while (more) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    // Try RPC first, fallback to direct query
    const { data, error: rpcError } = await supabase.rpc('get_user_contacts', {
      target_user_id: userId,
      page_offset: from,
      page_limit: pageSize
    });

    if (rpcError) {
      const { data: backup, error: qErr } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (qErr) throw new Error(qErr.message);
      if (backup?.length) all.push(...backup);
      if (!backup || backup.length < pageSize) more = false;
    } else {
      if (data?.length) all.push(...data);
      if (!data || data.length < pageSize) more = false;
    }

    page++;
  }

  return all;
}

// ---------- HTTP handler ----------

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userId } = req.method === 'POST' ? await req.json() : { userId: null };
    if (!userId) throw new Error('User ID is required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase environment variables are required');

    const supabase = createClient(supabaseUrl, serviceKey);
    const contacts = await getAllContactsPaginated(supabase, userId);
    if (!contacts?.length) {
      return new Response(JSON.stringify({ status: 'complete', message: 'No contacts for user' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    const lastNameMap = createLastNameMap(contacts);
    const news = new NewsProcessor(supabase);
    const results = await news.processAllPublications(lastNameMap, userId);

    return new Response(JSON.stringify({
      status: 'complete',
      message: 'News processing finished successfully',
      stats: {
        ...results,
        contactsProcessed: contacts.length,
        publicationsProcessed: Object.keys(WORDPRESS_APIS).length,
        method: 'database-plus-broadcast-workflow'
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error) {
    console.error('❌ Edge Function Error:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});