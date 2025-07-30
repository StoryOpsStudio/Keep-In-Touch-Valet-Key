// Enhanced news monitoring service with hybrid RSS + web scraping approach
// CRITICAL FIX: Updated with correct CSS selectors from live HTML inspection
// PHASE 2 & 3: Full article content search implementation
// MAJOR OVERHAUL: Real-time updates, performance optimization, accuracy improvements
// FINAL FIXES: True real-time updates and robust deduplication
// SORTING FIX: Added micro-delays for timestamp integrity

export interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  guid?: string;
}

export interface RSSFeed {
  title: string;
  description: string;
  items: RSSItem[];
}

export interface ScrapedArticle {
  title: string;
  url: string;
  pubDate?: string;
  excerpt?: string;
}

export interface NewsMatch {
  id: string;
  contactId: string;
  contactName: string;
  contactCategory: string;
  articleTitle: string;
  articleUrl: string;
  publication: 'deadline' | 'variety' | 'thr';
  matchLocation: 'title' | 'description' | 'full' | 'Full Article';
  excerpt: string;
  foundAt: Date;
  isNew: boolean;
  isRead: boolean;
  fullArticleContent?: string;
  source: 'rss' | 'scraping'; // Track source for debugging
}

export interface ProcessedArticle {
  url: string;
  firstSeen: Date;
  matchedContacts: string[];
  publication: 'deadline' | 'variety' | 'thr';
}

// Contact interface for type safety
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  category: string;
  createdAt: string;
}

// RSS feeds for real-time updates
const RSS_FEEDS = {
  deadline: [
    'https://deadline.com/feed/',
    'https://deadline.com/category/film/feed/',
    'https://deadline.com/category/tv/feed/',
    'https://deadline.com/category/breaking-news/feed/'
  ],
  variety: [
    'https://variety.com/feed/',
    'https://variety.com/c/film/feed/',
    'https://variety.com/c/tv/feed/',
    'https://variety.com/c/news/feed/'
  ],
  thr: [
    'https://www.hollywoodreporter.com/feed/',
    'https://www.hollywoodreporter.com/c/movies/feed/',
    'https://www.hollywoodreporter.com/c/tv/feed/',
    'https://www.hollywoodreporter.com/c/news/feed/'
  ]
};

// CRITICAL FIX: Correct CSS selectors from live HTML inspection
const SCRAPING_CONFIG = {
  deadline: {
    baseUrl: 'https://deadline.com',
    pages: 8,
    selectors: {
      articles: 'div.river-story', // The main container for each story
      link: 'h3#c-title a.c-title__link', // The specific link element
      title: 'h3#c-title a.c-title__link', // The title is the link's text
      excerpt: 'div.c-tagline', // The summary text below the title
      date: 'span.c-timestamp', // The timestamp element
    },
  },
  variety: {
    baseUrl: 'https://variety.com',
    pages: 5,
    selectors: {
      articles: 'li.o-tease-list__item', // Each article is in a list item
      link: 'h3.c-title a',
      title: 'h3.c-title a',
      excerpt: 'div.o-tease-post__a-dek', // This might not exist on all items
      date: 'span.c-timestamp',
    },
  },
  thr: {
    baseUrl: 'https://www.hollywoodreporter.com',
    pages: 5,
    selectors: {
      articles: 'div.lrv-a-grid__item', // The grid item containing the story
      link: 'a.c-title__link',
      title: 'a.c-title__link',
      excerpt: 'p.c-p', // The main paragraph for the excerpt
      date: 'span.c-timestamp',
    },
  },
};

// Try multiple CORS proxies until one works
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
  'https://api.codetabs.com/v1/proxy?quest='
];

class NewsService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_RSS_ITEMS = 200;
  private readonly TARGET_DAYS = 2;
  private processedUrls = new Set<string>();

  // Normalize URL to prevent duplicates
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      urlObj.protocol = 'https:';
      urlObj.hash = '';
      urlObj.search = '';
      
      let pathname = urlObj.pathname;
      if (pathname.endsWith('/') && pathname.length > 1) {
        pathname = pathname.slice(0, -1);
      }
      urlObj.pathname = pathname;
      
      return urlObj.toString();
    } catch (error) {
      console.warn(`⚠️ Failed to normalize URL "${url}":`, error);
      return url;
    }
  }

  // Try multiple CORS proxies until one works
  private async fetchWithProxy(url: string): Promise<string> {
    console.log(`🔗 Attempting to fetch: ${url}`);
    
    for (let i = 0; i < CORS_PROXIES.length; i++) {
      const proxy = CORS_PROXIES[i];
      const proxyUrl = proxy + encodeURIComponent(url);
      
      try {
        console.log(`🔄 Trying proxy ${i + 1}/${CORS_PROXIES.length}: ${proxy}`);
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        console.log(`✅ Success with proxy ${i + 1}: ${text.length} characters received`);
        return text;
        
      } catch (error) {
        console.warn(`⚠️ Proxy ${i + 1} failed:`, error);
        if (i === CORS_PROXIES.length - 1) {
          throw new Error(`All CORS proxies failed. Last error: ${error}`);
        }
      }
    }
    
    throw new Error('No working CORS proxy found');
  }

  // Enhanced fetchFullArticleContent with surgical content cleaning
  private async fetchFullArticleContent(articleUrl: string, publication: string): Promise<string> {
    try {
      console.log(`📄 Fetching full content for: ${articleUrl}`);
      
      const html = await this.fetchWithProxy(articleUrl);
      if (!html) return '';

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const contentSelectors = {
        deadline: '.a-content, .entry-content, .post-content',
        variety: '.c-content, .article-content, .vy-article-body',
        thr: '.a-content, .entry-content, .article-body-container',
      };

      const selector = contentSelectors[publication as keyof typeof contentSelectors];
      const contentElement = doc.querySelector(selector);
      
      if (contentElement) {
        // Surgically remove noise elements to improve accuracy
        const noiseSelectors = [
          '.l-article-rec-unit', '.OUTBRAIN', '.a-river-rail', '.c-related-links',
          '.wp-block-embed', 'aside', '[id*="related"]', '[class*="related"]',
          '[id*="sidebar"]', '[class*="sidebar"]', 'figure',
        ];
        contentElement.querySelectorAll(noiseSelectors.join(', ')).forEach(el => el.remove());
        
        const fullText = contentElement.innerText || contentElement.textContent || '';
        console.log(`📄 Extracted ${fullText.length} characters from ${publication} article (cleaned)`);
        return this.cleanText(fullText);
      } else {
        console.warn(`⚠️ No content found with selector "${selector}" for ${publication}`);
        return '';
      }
    } catch (error) {
      console.error(`❌ Failed to fetch or parse full content for ${articleUrl}:`, error);
      return ''; // Return empty string on failure
    }
  }

  // FIXED: Expanded context for full content match excerpts
  private getExcerptFromFullContent(content: string, name: string): string {
    const index = content.toLowerCase().indexOf(name.toLowerCase());
    if (index === -1) return content.substring(0, 200) + '...';

    // EXPANDED: Increased context from 50 to 150 characters on each side
    const start = Math.max(0, index - 150);
    const end = Math.min(content.length, index + name.length + 150);
    
    return `...${content.substring(start, end)}...`;
  }

  // Clean HTML entities and extra whitespace from text
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
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

  // Enhanced article URL validation
  private isValidArticleUrl(url: string, publication: string): boolean {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Skip obvious non-article URLs
      const skipPatterns = [
        '/category/', '/tag/', '/author/', '/search/', '/page/',
        '/wp-content/', '/wp-admin/', '/feed/', '/rss/',
        '/newsletter/', '/subscribe/', '/contact/', '/about/',
        '/privacy/', '/terms/', '/sitemap/', '/robots.txt',
        '.jpg', '.png', '.gif', '.pdf', '.css', '.js',
        '#', 'javascript:', 'mailto:', 'tel:'
      ];
      
      for (const pattern of skipPatterns) {
        if (pathname.includes(pattern) || url.includes(pattern)) {
          return false;
        }
      }
      
      // Check for article indicators
      const articleIndicators = [
        '/2024/', '/2025/', // Year in URL
        '/video/', '/gallery/', '/news/', '/story/', // Content types
        pathname.split('/').filter(Boolean).length > 3, // Deep path
        pathname.includes('.html'), // HTML extension
        /\/\d{4}\/\d{2}\/\d{2}\//.test(pathname) // Date pattern
      ];
      
      // Must have at least one article indicator
      return articleIndicators.some(indicator => indicator === true);
      
    } catch (error) {
      console.warn(`⚠️ Invalid URL format: ${url}`);
      return false;
    }
  }

  // Check if article is within target date range
  private isRecentArticle(pubDate?: string): boolean {
    if (!pubDate) return true; // Include if no date available
    
    try {
      const articleDate = new Date(pubDate);
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - this.TARGET_DAYS);
      
      return articleDate >= twoDaysAgo;
    } catch (error) {
      return true; // Include if date parsing fails
    }
  }

  // Updated scrapePage method with correct selectors
  private scrapePage(html: string, publication: string): ScrapedArticle[] {
    // Debug logging
    console.log(`🔍 First 2000 chars of ${publication} HTML:`, html.substring(0, 2000));
    
    // Check if proxy is wrapping the response in JSON
    try {
      const jsonResponse = JSON.parse(html);
      if (jsonResponse.contents) {
        html = jsonResponse.contents;
        console.log('📦 Unwrapped JSON response from proxy');
      }
    } catch (e) {
      // Not JSON, proceed with raw HTML
    }
    
    // Count how many article-like URLs exist in the HTML
    const urlCount = (html.match(/deadline\.com\/(?:2024|2025|video|gallery|news)\//g) || []).length;
    console.log(`🔍 Total article URLs found in HTML: ${urlCount}`);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const config = SCRAPING_CONFIG[publication as keyof typeof SCRAPING_CONFIG];
    const articles: ScrapedArticle[] = [];
    
    // Use the correct selectors from live HTML inspection
    const articleElements = Array.from(doc.querySelectorAll(config.selectors.articles));
    console.log(`📰 Found ${articleElements.length} potential article elements using selector: "${config.selectors.articles}"`);

    for (const element of articleElements) {
      const linkElement = element.querySelector<HTMLAnchorElement>(config.selectors.link);
      const titleElement = element.querySelector<HTMLElement>(config.selectors.title);
      
      if (!linkElement || !titleElement) {
        // Skip if the essential elements (link, title) are not found
        continue;
      }

      const excerptElement = element.querySelector<HTMLElement>(config.selectors.excerpt);
      const dateElement = element.querySelector<HTMLElement>(config.selectors.date);

      let articleUrl = linkElement.href;
      
      // Convert relative URLs to absolute
      if (articleUrl.startsWith('/')) {
        articleUrl = config.baseUrl + articleUrl;
      }
      
      articleUrl = this.normalizeUrl(articleUrl);
      const title = this.cleanText(titleElement.innerText || titleElement.textContent || '');
      const excerpt = excerptElement ? this.cleanText(excerptElement.innerText || excerptElement.textContent || '') : '';
      const pubDate = dateElement ? (dateElement.getAttribute('datetime') || dateElement.innerText || dateElement.textContent || '') : '';

      if (!this.isValidArticleUrl(articleUrl, publication)) {
        continue;
      }
      
      // Add the successfully extracted article
      articles.push({ 
        title, 
        url: articleUrl, 
        pubDate, 
        excerpt 
      });
    }
    
    // If no articles found with primary selectors, try regex fallback
    if (articles.length === 0) {
      console.log('🔍 Fallback: Using regex to find article URLs...');
      
      // Look for article URLs in href attributes
      const urlPattern = /href=["'](https?:\/\/[^"']*(?:deadline|variety|hollywoodreporter)\.com\/(?:2024|2025|video|gallery|news)\/[^"']+)["']/gi;
      const matches = html.matchAll(urlPattern);
      
      for (const match of matches) {
        const url = match[1];
        // Try to extract title from link text
        const titleMatch = html.match(new RegExp(`<a[^>]*href=["']${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>([^<]+)</a>`, 'i'));
        if (titleMatch) {
          articles.push({
            title: this.cleanText(titleMatch[1]),
            url: this.normalizeUrl(url),
            pubDate: '',
            excerpt: ''
          });
        }
      }
      console.log(`📰 Regex found ${articles.length} articles`);
    }
    
    console.log(`📊 ${publication} parsing complete: ${articles.length} articles extracted`);
    return articles;
  }

  // Parse RSS XML to extract feed data
  private parseRSSXML(xmlText: string): RSSFeed {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Failed to parse RSS XML');
    }

    const channel = xmlDoc.querySelector('channel');
    if (!channel) {
      throw new Error('Invalid RSS format - no channel element');
    }

    const title = channel.querySelector('title')?.textContent || 'Unknown Feed';
    const description = channel.querySelector('description')?.textContent || '';
    
    const items: RSSItem[] = [];
    const itemElements = channel.querySelectorAll('item');
    
    const itemsToProcess = Math.min(itemElements.length, this.MAX_RSS_ITEMS);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - this.TARGET_DAYS);
    
    for (let i = 0; i < itemsToProcess; i++) {
      const item = itemElements[i];
      
      const itemTitle = item.querySelector('title')?.textContent || '';
      const itemDescription = item.querySelector('description')?.textContent || '';
      const itemLink = item.querySelector('link')?.textContent || '';
      const itemPubDate = item.querySelector('pubDate')?.textContent || '';
      const itemGuid = item.querySelector('guid')?.textContent || '';
      
      if (itemTitle && itemLink) {
        let includeItem = true;
        if (itemPubDate) {
          const pubDate = new Date(itemPubDate);
          if (pubDate < twoDaysAgo) {
            includeItem = false;
          }
        }
        
        if (includeItem) {
          items.push({
            title: this.cleanText(itemTitle),
            description: this.cleanText(itemDescription),
            link: this.normalizeUrl(itemLink.trim()),
            pubDate: itemPubDate.trim(),
            guid: itemGuid.trim()
          });
        }
      }
    }

    return {
      title: this.cleanText(title),
      description: this.cleanText(description),
      items
    };
  }

  // Enhanced scraping with correct selectors
  async scrapeArticlePages(publication: keyof typeof SCRAPING_CONFIG): Promise<ScrapedArticle[]> {
    const config = SCRAPING_CONFIG[publication];
    const allArticles: ScrapedArticle[] = [];
    
    console.log(`\n🕷️ Starting web scraping for ${publication}...`);
    console.log(`📄 Will scrape ${config.pages} pages for comprehensive coverage`);
    
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - this.TARGET_DAYS);
    
    // Scrape main page first
    try {
      const html = await this.fetchWithProxy(config.baseUrl);
      const mainPageArticles = this.scrapePage(html, publication);
      allArticles.push(...mainPageArticles);
      console.log(`📰 Main page: ${mainPageArticles.length} articles found`);
    } catch (error) {
      console.error(`❌ Failed to scrape main page for ${publication}:`, error);
    }
    
    // Scrape additional pages
    for (let page = 2; page <= config.pages + 1; page++) {
      try {
        const pageUrl = `${config.baseUrl}/page/${page}/`;
        const html = await this.fetchWithProxy(pageUrl);
        const pageArticles = this.scrapePage(html, publication);
        allArticles.push(...pageArticles);
        
        console.log(`📰 Page ${page}: ${pageArticles.length} articles found`);
        
        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.warn(`⚠️ Failed to scrape page ${page} for ${publication}:`, error);
        // Continue with other pages
      }
    }
    
    // Filter articles to last 2 days and remove duplicates
    const uniqueArticles = new Map<string, ScrapedArticle>();
    
    for (const article of allArticles) {
      const normalizedUrl = this.normalizeUrl(article.url);
      
      // Skip if we already have this URL
      if (uniqueArticles.has(normalizedUrl)) {
        continue;
      }
      
      // Check if article is recent enough (if we have a date)
      if (article.pubDate) {
        const articleDate = new Date(article.pubDate);
        if (articleDate < twoDaysAgo) {
          continue;
        }
      }
      
      uniqueArticles.set(normalizedUrl, {
        ...article,
        url: normalizedUrl
      });
    }
    
    const finalArticles = Array.from(uniqueArticles.values());
    console.log(`✅ ${publication} scraping complete: ${finalArticles.length} unique recent articles`);
    
    return finalArticles;
  }

  // Check article for contact matches (title/excerpt only)
  private checkArticleForMatches(article: { title: string; excerpt?: string; url: string; pubDate?: string }, contacts: Contact[], source: 'rss' | 'scraping'): NewsMatch[] {
    const matches: NewsMatch[] = [];
    const titleText = article.title.toLowerCase();
    const excerptText = (article.excerpt || '').toLowerCase();
    
    for (const contact of contacts) {
      if (!contact.firstName || !contact.lastName) continue;
      
      const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      let matchLocation: 'title' | 'description' | null = null;
      let excerpt = '';
      
      // Check title first (higher priority)
      if (titleText.includes(fullName)) {
        matchLocation = 'title';
        excerpt = article.title;
      }
      // Check excerpt if available and not already matched in title
      else if (excerptText && excerptText.includes(fullName)) {
        matchLocation = 'description';
        excerpt = this.findExcerpt(article.excerpt || '', fullName, 300);
      }
      
      if (matchLocation) {
        const match: NewsMatch = {
          id: `${article.url}-${contact.id}`,
          contactId: contact.id,
          contactName: `${contact.firstName} ${contact.lastName}`,
          contactCategory: contact.category || 'OTHER',
          articleTitle: article.title,
          articleUrl: article.url,
          publication: this.getPublicationFromUrl(article.url),
          matchLocation,
          excerpt,
          foundAt: article.pubDate ? new Date(article.pubDate) : new Date(),
          isNew: true,
          isRead: false,
          source
        };
        
        matches.push(match);
      }
    }
    
    return matches;
  }

  // Get publication from URL
  private getPublicationFromUrl(url: string): 'deadline' | 'variety' | 'thr' {
    if (url.includes('deadline.com')) return 'deadline';
    if (url.includes('variety.com')) return 'variety';
    if (url.includes('hollywoodreporter.com')) return 'thr';
    return 'deadline'; // fallback
  }

  // Check scraped article for contact matches
  checkScrapedArticle(article: ScrapedArticle, contacts: Contact[]): Array<{
    contact: Contact;
    matchLocation: 'title' | 'description';
  }> {
    const matches = [];
    const titleText = article.title.toLowerCase();
    const excerptText = (article.excerpt || '').toLowerCase();
    
    for (const contact of contacts) {
      if (!contact.firstName || !contact.lastName) continue;
      
      const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      
      // Check title first (higher priority)
      if (titleText.includes(fullName)) {
        matches.push({
          contact,
          matchLocation: 'title' as const
        });
        continue;
      }
      
      // Check excerpt if available
      if (excerptText && excerptText.includes(fullName)) {
        matches.push({
          contact,
          matchLocation: 'description' as const
        });
      }
    }
    
    return matches;
  }

  // Fetch RSS feed
  async fetchRSSFeed(feedUrl: string, feedName: string): Promise<RSSFeed> {
    const cacheKey = `rss-${feedUrl}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`📰 Using cached RSS for ${feedName}`);
      return cached.data;
    }

    console.log(`📡 Fetching RSS feed: ${feedName}`);

    try {
      const xmlText = await this.fetchWithProxy(feedUrl);
      const feed = this.parseRSSXML(xmlText);
      
      console.log(`✅ Successfully fetched ${feedName}: ${feed.items.length} items`);
      
      this.cache.set(cacheKey, { data: feed, timestamp: Date.now() });
      return feed;
    } catch (error) {
      console.error(`❌ Failed to fetch RSS feed ${feedName}:`, error);
      throw new Error(`Failed to fetch ${feedName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Check RSS item for contact matches
  checkRSSItem(item: RSSItem, contacts: Contact[]): Array<{
    contact: Contact;
    matchLocation: 'title' | 'description';
  }> {
    const matches = [];
    const titleText = item.title.toLowerCase();
    const descriptionText = item.description.toLowerCase();
    
    for (const contact of contacts) {
      if (!contact.firstName || !contact.lastName) continue;
      
      const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
      
      if (titleText.includes(fullName)) {
        matches.push({
          contact,
          matchLocation: 'title' as const
        });
        continue;
      }
      
      if (descriptionText.includes(fullName)) {
        matches.push({
          contact,
          matchLocation: 'description' as const
        });
      }
    }
    
    return matches;
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

  // MAIN METHOD with real-time callbacks, performance optimization, and robust deduplication
  // FIXED: Added micro-delays for timestamp integrity in quick-pass phases
  public async processAllFeeds(
    contacts: Contact[],
    existingMatches: NewsMatch[],
    onMatchFound: (match: NewsMatch) => void,
    onProgress: (status: string) => void,
    signal: AbortSignal,
    fullContentLimit: number | null = null
  ): Promise<void> {
    this.processedUrls.clear();
    
    if (fullContentLimit === null) {
      console.log('✅ Background Process: Running UNLIMITED deep scan.');
    } else {
      console.log(`✅ Manual Process: Running LIMITED scan with a cap of ${fullContentLimit} articles.`);
    }
    
    // Create a Set of keys for all matches that already exist (robust deduplication)
    const sessionMatchKeys = new Set<string>(
      existingMatches.map(m => `${m.articleUrl}-${m.contactId}`)
    );
    
    console.log(`\n🚀 Starting HYBRID RSS + Web Scraping + FULL CONTENT SEARCH`);
    console.log(`📊 Processing ${contacts.length} contacts`);
    console.log(`📅 Targeting ${this.TARGET_DAYS} days of comprehensive coverage`);
    console.log(`🔄 Method: RSS feeds first, then web scraping, then full article content search`);
    console.log(`⚡ Performance mode: ${fullContentLimit ? `Limited to ${fullContentLimit} full content scans` : 'Unlimited full content scans'}`);
    console.log(`🔒 Deduplication: ${sessionMatchKeys.size} existing matches will be filtered out`);
    
    // Check for abort signal
    if (signal.aborted) throw new Error('AbortError');
    
    // Show sample contact names
    console.log(`👥 Sample contact names:`);
    contacts.slice(0, 5).forEach((contact, i) => {
      console.log(`   ${i + 1}. "${contact.firstName} ${contact.lastName}"`);
    });
    if (contacts.length > 5) {
      console.log(`   ... and ${contacts.length - 5} more`);
    }
    
    // Collect all unique articles from RSS and scraping
    const allUniqueArticles = new Map<string, { 
      title: string; 
      url: string; 
      pubDate?: string; 
      excerpt?: string; 
      publication: 'deadline' | 'variety' | 'thr';
      source: 'rss' | 'scraping';
    }>();
    
    // PHASE 1: Process RSS feeds (for real-time updates)
    onProgress('Scanning RSS feeds for real-time updates...');
    console.log(`\n📡 PHASE 1: Processing RSS feeds for real-time updates...`);
    
    for (const [publication, feedUrls] of Object.entries(RSS_FEEDS)) {
      if (signal.aborted) throw new Error('AbortError');
      
      console.log(`\n📰 RSS Processing: ${publication} (${feedUrls.length} feeds)...`);
      onProgress(`Scanning ${publication} RSS feeds...`);
      
      let rssMatches = 0;
      let rssItems = 0;
      
      for (let feedIndex = 0; feedIndex < feedUrls.length; feedIndex++) {
        if (signal.aborted) throw new Error('AbortError');
        
        const feedUrl = feedUrls[feedIndex];
        const feedName = `${publication}-rss-${feedIndex + 1}`;
        
        try {
          const feed = await this.fetchRSSFeed(feedUrl, feedName);
          rssItems += feed.items.length;
          
          for (const item of feed.items) {
            if (signal.aborted) throw new Error('AbortError');
            
            const normalizedUrl = this.normalizeUrl(item.link);
            
            // Add to unique articles collection
            allUniqueArticles.set(normalizedUrl, {
              title: item.title,
              url: normalizedUrl,
              pubDate: item.pubDate,
              excerpt: item.description,
              publication: publication as 'deadline' | 'variety' | 'thr',
              source: 'rss'
            });
            
            // Quick title/description check
            const rssItemMatches = this.checkRSSItem(item, contacts);
            
            for (const rssMatch of rssItemMatches) {
              const { contact, matchLocation } = rssMatch;
              const contactName = `${contact.firstName} ${contact.lastName}`;
              
              const excerpt = matchLocation === 'title' ? 
                item.title : 
                this.findExcerpt(item.description, contactName, 300);
              
              const match: NewsMatch = {
                id: `${normalizedUrl}-${contact.id}`,
                contactId: contact.id,
                contactName,
                contactCategory: contact.category || 'OTHER',
                articleTitle: item.title,
                articleUrl: normalizedUrl,
                publication: publication as 'deadline' | 'variety' | 'thr',
                matchLocation,
                excerpt,
                foundAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                isNew: true,
                isRead: false,
                source: 'rss'
              };
              
              // Check against deduplication Set before calling callback
              const matchKey = `${match.articleUrl}-${match.contactId}`;
              if (!sessionMatchKeys.has(matchKey)) {
                sessionMatchKeys.add(matchKey);
                onMatchFound(match);
                rssMatches++;
              }
            }
            
            // FIXED: Add micro-delay for timestamp integrity in RSS phase
            await new Promise(res => setTimeout(res, 10)); // 10ms delay for sort integrity
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
          
        } catch (error) {
          console.warn(`⚠️ RSS ${feedName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      console.log(`✅ RSS ${publication}: ${rssMatches} matches from ${rssItems} articles`);
    }
    
    // PHASE 2: Web scraping for comprehensive coverage
    onProgress('Web scraping for comprehensive coverage...');
    console.log(`\n🕷️ PHASE 2: Web scraping for comprehensive coverage...`);
    
    for (const publication of Object.keys(SCRAPING_CONFIG) as Array<keyof typeof SCRAPING_CONFIG>) {
      if (signal.aborted) throw new Error('AbortError');
      
      console.log(`\n🔍 Scraping ${publication} for additional articles...`);
      onProgress(`Scraping ${publication} for additional articles...`);

      try {
        const scrapedArticles = await this.scrapeArticlePages(publication);
        let scrapingMatches = 0;
        let newArticles = 0;
        
        for (const article of scrapedArticles) {
          if (signal.aborted) throw new Error('AbortError');
          
          const normalizedUrl = this.normalizeUrl(article.url);
          
          // Add to unique articles collection if not already present
          if (!allUniqueArticles.has(normalizedUrl)) {
            allUniqueArticles.set(normalizedUrl, {
              title: article.title,
              url: normalizedUrl,
              pubDate: article.pubDate,
              excerpt: article.excerpt,
              publication: publication as 'deadline' | 'variety' | 'thr',
              source: 'scraping'
            });
            newArticles++;
          }
          
          // Quick title/excerpt check
          const scrapedMatches = this.checkScrapedArticle(article, contacts);
          
          for (const scrapedMatch of scrapedMatches) {
            const { contact, matchLocation } = scrapedMatch;
            const contactName = `${contact.firstName} ${contact.lastName}`;
            
            const excerpt = matchLocation === 'title' ? 
              article.title : 
              this.findExcerpt(article.excerpt || article.title, contactName, 300);
            
            const match: NewsMatch = {
              id: `${normalizedUrl}-${contact.id}`,
              contactId: contact.id,
              contactName,
              contactCategory: contact.category || 'OTHER',
              articleTitle: article.title,
              articleUrl: normalizedUrl,
              publication: publication as 'deadline' | 'variety' | 'thr',
              matchLocation,
              excerpt,
              foundAt: article.pubDate ? new Date(article.pubDate) : new Date(),
              isNew: true,
              isRead: false,
              source: 'scraping'
            };
            
            // Check against deduplication Set before calling callback
            const matchKey = `${match.articleUrl}-${match.contactId}`;
            if (!sessionMatchKeys.has(matchKey)) {
              sessionMatchKeys.add(matchKey);
              onMatchFound(match);
              scrapingMatches++;
            }
          }
          
          // FIXED: Add micro-delay for timestamp integrity in scraping phase
          await new Promise(res => setTimeout(res, 10)); // 10ms delay for sort integrity
        }
        
        console.log(`✅ Scraping ${publication}: ${scrapingMatches} matches from ${newArticles} new articles`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.warn(`⚠️ Scraping ${publication}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // PHASE 3: Full content search for comprehensive matching (with performance optimization)
    const uniqueArticles = Array.from(allUniqueArticles.values());
    
    // Performance optimization - limit full content scans for manual checks
    const articlesToDeepScan = fullContentLimit !== null
      ? uniqueArticles.slice(0, fullContentLimit)
      : uniqueArticles;

    onProgress(`Searching full content for ${articlesToDeepScan.length} articles...`);
    console.log(`\n📄 PHASE 3: Full article content search for comprehensive matching...`);
    console.log(`🔍 Processing ${articlesToDeepScan.length} articles for full content search (${fullContentLimit ? 'limited for performance' : 'unlimited'})`);
    
    let fullContentMatches = 0;
    let articlesProcessed = 0;
    
    for (const article of articlesToDeepScan) {
      if (signal.aborted) throw new Error('AbortError');
      
      // Only process recent articles for full content search
      if (!this.isRecentArticle(article.pubDate)) {
        continue;
      }
      
      articlesProcessed++;
      onProgress(`Processing full content: ${article.title} (${articlesProcessed}/${articlesToDeepScan.length})`);
      console.log(`📄 [${articlesProcessed}/${articlesToDeepScan.length}] Processing full content: ${article.title}`);
      
      // Now, fetch and check full content for deeper matches
      const fullContent = await this.fetchFullArticleContent(article.url, article.publication);
      
      if (fullContent) {
        for (const contact of contacts) {
          if (signal.aborted) throw new Error('AbortError');
          
          const fullName = `${contact.firstName} ${contact.lastName}`;
          
          // Search for the contact in the full article text
          if (fullContent.toLowerCase().includes(fullName.toLowerCase())) {
            const match: NewsMatch = {
              id: `${article.url}-${contact.id}-full`,
              contactId: contact.id,
              contactName: fullName,
              contactCategory: contact.category || 'OTHER',
              articleTitle: article.title,
              articleUrl: article.url,
              publication: article.publication,
              matchLocation: 'Full Article',
              excerpt: this.getExcerptFromFullContent(fullContent, fullName),
              foundAt: article.pubDate ? new Date(article.pubDate) : new Date(),
              isNew: true,
              isRead: false,
              source: article.source,
              fullArticleContent: fullContent.substring(0, 1000) // Store first 1000 chars
            };
            
            // Check against deduplication Set before calling callback
            const matchKey = `${match.articleUrl}-${match.contactId}`;
            if (!sessionMatchKeys.has(matchKey)) {
              sessionMatchKeys.add(matchKey);
              onMatchFound(match);
              fullContentMatches++;
              
              console.log(`🎯 FULL CONTENT MATCH: "${fullName}" found in "${article.title}"`);
            }
          }
        }
      }
      
      // Add a small delay to be respectful to the servers
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    // Final summary
    onProgress('Processing complete!');
    console.log(`\n🎯 COMPREHENSIVE PROCESSING COMPLETE!`);
    console.log(`📄 Full content matches: ${fullContentMatches}`);
    console.log(`📊 Articles processed for full content: ${articlesProcessed}`);
    console.log(`🔒 Total unique matches found (after deduplication): ${sessionMatchKeys.size - existingMatches.length}`);
  }

  // Get processed articles from localStorage
  getProcessedArticles(): ProcessedArticle[] {
    try {
      const stored = localStorage.getItem('news-processed-articles');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load processed articles:', error);
      return [];
    }
  }

  // Save processed articles to localStorage
  saveProcessedArticles(articles: ProcessedArticle[]): void {
    try {
      localStorage.setItem('news-processed-articles', JSON.stringify(articles));
    } catch (error) {
      console.error('Failed to save processed articles:', error);
    }
  }

  // Check if article URL has been processed before
  isArticleProcessed(url: string): boolean {
    const normalizedUrl = this.normalizeUrl(url);
    const processed = this.getProcessedArticles();
    return processed.some(article => this.normalizeUrl(article.url) === normalizedUrl);
  }

  // Mark article as processed
  markArticleProcessed(url: string, matchedContacts: string[], publication: 'deadline' | 'variety' | 'thr'): void {
    const normalizedUrl = this.normalizeUrl(url);
    const processed = this.getProcessedArticles();
    
    const filtered = processed.filter(article => 
      this.normalizeUrl(article.url) !== normalizedUrl
    );
    
    filtered.push({
      url: normalizedUrl,
      firstSeen: new Date(),
      matchedContacts,
      publication
    });
    
    const limited = filtered.slice(-1000);
    this.saveProcessedArticles(limited);
  }

  // Filter out already processed matches
  filterNewMatches(matches: NewsMatch[]): NewsMatch[] {
    return matches.filter(match => !this.isArticleProcessed(match.articleUrl));
  }

  // Get publication display name
  getPublicationName(publication: string): string {
    const names = {
      deadline: 'Deadline',
      variety: 'Variety',
      thr: 'The Hollywood Reporter'
    };
    return names[publication as keyof typeof names] || publication;
  }

  // Get match quality indicator
  getMatchQuality(match: NewsMatch): { icon: string; label: string; description: string } {
    const sourceIcon = match.source === 'rss' ? '📡' : '🕷️';
    
    switch (match.matchLocation) {
      case 'title':
        return {
          icon: `🏆 ${sourceIcon}`,
          label: 'Title Match',
          description: `Contact mentioned in article headline (${match.source})`
        };
      case 'description':
        return {
          icon: `📝 ${sourceIcon}`,
          label: 'Summary Match',
          description: `Contact mentioned in article summary (${match.source})`
        };
      case 'Full Article':
        return {
          icon: `📄 ${sourceIcon}`,
          label: 'Full Content Match',
          description: `Contact found in complete article text (${match.source})`
        };
      case 'full':
        return {
          icon: `📄 ${sourceIcon}`,
          label: 'Article Match',
          description: `Contact mentioned in full article (${match.source})`
        };
      default:
        return {
          icon: `📰 ${sourceIcon}`,
          label: 'News Match',
          description: `Contact found in article (${match.source})`
        };
    }
  }
}

export const newsService = new NewsService();