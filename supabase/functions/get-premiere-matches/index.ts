import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// TMDB API Configuration
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

// NEW: Name Variation Map for common nicknames and their full name equivalents
const NAME_VARIATIONS = new Map<string, string[]>([
  // Common nicknames
  ['dan', ['daniel']],
  ['danny', ['daniel']],
  ['rob', ['robert']],
  ['bob', ['robert']],
  ['bobby', ['robert']],
  ['chris', ['christopher']],
  ['mike', ['michael']],
  ['micky', ['michael']],
  ['mickey', ['michael']],
  ['bill', ['william']],
  ['billy', ['william']],
  ['will', ['william']],
  ['jim', ['james']],
  ['jimmy', ['james']],
  ['joe', ['joseph']],
  ['joey', ['joseph']],
  ['tom', ['thomas']],
  ['tommy', ['thomas']],
  ['dave', ['david']],
  ['davey', ['david']],
  ['steve', ['steven', 'stephen']],
  ['stevie', ['steven', 'stephen']],
  ['rick', ['richard']],
  ['ricky', ['richard']],
  ['dick', ['richard']],
  ['tony', ['anthony']],
  ['matt', ['matthew']],
  ['nick', ['nicholas']],
  ['nicky', ['nicholas']],
  ['alex', ['alexander', 'alexandra']],
  ['sam', ['samuel', 'samantha']],
  ['ben', ['benjamin']],
  ['benny', ['benjamin']],
  ['andy', ['andrew']],
  ['drew', ['andrew']],
  ['kate', ['katherine', 'kathryn']],
  ['katie', ['katherine', 'kathryn']],
  ['kathy', ['katherine', 'kathryn']],
  ['liz', ['elizabeth']],
  ['beth', ['elizabeth']],
  ['betty', ['elizabeth']],
  ['sue', ['susan']],
  ['susie', ['susan']],
  ['jen', ['jennifer']],
  ['jenny', ['jennifer']],
  ['jess', ['jessica']],
  ['jessie', ['jessica']],
  ['amy', ['amelia']],
  ['mel', ['melissa', 'melanie']],
  ['lisa', ['elizabeth']],
  ['pat', ['patricia', 'patrick']],
  ['patty', ['patricia']],
  ['trish', ['patricia']],
  ['nancy', ['ann', 'anne']],
  ['peggy', ['margaret']],
  ['maggie', ['margaret']],
  ['meg', ['margaret']],
  ['cindy', ['cynthia']],
  ['mandy', ['amanda']],
  ['sandy', ['sandra']],
  ['becky', ['rebecca']],
  ['debbie', ['deborah']],
  ['deb', ['deborah']],
  ['carol', ['caroline']],
  ['carrie', ['caroline']],
  ['terry', ['teresa', 'terence']],
  ['tim', ['timothy']],
  ['greg', ['gregory']],
  ['ken', ['kenneth']],
  ['kenny', ['kenneth']],
  ['ed', ['edward']],
  ['eddie', ['edward']],
  ['ted', ['edward', 'theodore']],
  ['frank', ['francis']],
  ['ray', ['raymond']],
  ['ron', ['ronald']],
  ['ronnie', ['ronald']],
  ['don', ['donald']],
  ['donnie', ['donald']],
  ['mark', ['marcus']],
  ['max', ['maxwell', 'maximilian']],
  ['jake', ['jacob']],
  ['jack', ['john', 'jackson']],
  ['johnny', ['john']],
  ['jon', ['jonathan', 'john']],
  ['josh', ['joshua']],
  ['brad', ['bradley']],
  ['chad', ['charles']],
  ['chuck', ['charles']],
  ['charlie', ['charles']],
  ['rich', ['richard']],
  ['richie', ['richard']],
  ['phil', ['philip']],
  ['pete', ['peter']],
  ['paul', ['paul']],
  ['scott', ['scott']],
  ['sean', ['john']],
  ['shane', ['john']],
  ['shawn', ['john']],
  ['brian', ['bryan']],
  ['bryan', ['brian']],
  ['craig', ['craig']],
  ['derek', ['derrick']],
  ['derrick', ['derek']],
  ['eric', ['erik']],
  ['erik', ['eric']],
  ['gary', ['garrett']],
  ['jeff', ['jeffrey']],
  ['jerry', ['gerald', 'jerome']],
  ['larry', ['lawrence']],
  ['barry', ['barrett']],
  ['harry', ['harold', 'henry']],
  ['henry', ['harry']],
  ['harold', ['harry']],
  ['carl', ['karl']],
  ['karl', ['carl']],
  ['neal', ['neil']],
  ['neil', ['neal']],
  ['alan', ['allen']],
  ['allen', ['alan']],
  ['aaron', ['aron']],
  ['aron', ['aaron']],
  ['adam', ['adam']],
  ['adrian', ['adrian']],
  ['albert', ['al']],
  ['al', ['albert', 'alan', 'allen']],
  ['arthur', ['art']],
  ['art', ['arthur']],
  ['austin', ['austin']],
  ['blake', ['blake']],
  ['bruce', ['bruce']],
  ['calvin', ['cal']],
  ['cal', ['calvin']],
  ['cameron', ['cam']],
  ['cam', ['cameron']],
  ['curtis', ['curt']],
  ['curt', ['curtis']],
  ['douglas', ['doug']],
  ['doug', ['douglas']],
  ['eugene', ['gene']],
  ['gene', ['eugene']],
  ['francis', ['frank']],
  ['frederick', ['fred']],
  ['fred', ['frederick']],
  ['gabriel', ['gabe']],
  ['gabe', ['gabriel']],
  ['george', ['george']],
  ['gerald', ['jerry']],
  ['gordon', ['gordon']],
  ['howard', ['howie']],
  ['howie', ['howard']],
  ['ivan', ['ivan']],
  ['jason', ['jay']],
  ['jay', ['jason', 'james']],
  ['jerome', ['jerry']],
  ['jordan', ['jordan']],
  ['justin', ['justin']],
  ['keith', ['keith']],
  ['kevin', ['kevin']],
  ['kyle', ['kyle']],
  ['lance', ['lance']],
  ['leon', ['leon']],
  ['louis', ['lou']],
  ['lou', ['louis']],
  ['lucas', ['luke']],
  ['luke', ['lucas']],
  ['marcus', ['mark']],
  ['martin', ['marty']],
  ['marty', ['martin']],
  ['mason', ['mason']],
  ['nathan', ['nate']],
  ['nate', ['nathan']],
  ['norman', ['norm']],
  ['norm', ['norman']],
  ['oliver', ['ollie']],
  ['ollie', ['oliver']],
  ['oscar', ['oscar']],
  ['owen', ['owen']],
  ['patrick', ['pat']],
  ['quinton', ['quinn']],
  ['quinn', ['quinton']],
  ['ralph', ['ralph']],
  ['randall', ['randy']],
  ['randy', ['randall']],
  ['roger', ['roger']],
  ['russell', ['russ']],
  ['russ', ['russell']],
  ['stanley', ['stan']],
  ['stan', ['stanley']],
  ['stuart', ['stu']],
  ['stu', ['stuart']],
  ['trevor', ['trev']],
  ['trev', ['trevor']],
  ['victor', ['vic']],
  ['vic', ['victor']],
  ['walter', ['walt']],
  ['walt', ['walter']],
  ['warren', ['warren']],
  ['wayne', ['wayne']],
  ['wesley', ['wes']],
  ['wes', ['wesley']],
  ['zachary', ['zach']],
  ['zach', ['zachary']],
  
  // Reverse mappings (full names to nicknames)
  ['daniel', ['dan', 'danny']],
  ['robert', ['rob', 'bob', 'bobby']],
  ['christopher', ['chris']],
  ['michael', ['mike', 'micky', 'mickey']],
  ['william', ['bill', 'billy', 'will']],
  ['james', ['jim', 'jimmy']],
  ['joseph', ['joe', 'joey']],
  ['thomas', ['tom', 'tommy']],
  ['david', ['dave', 'davey']],
  ['steven', ['steve', 'stevie']],
  ['stephen', ['steve', 'stevie']],
  ['richard', ['rick', 'ricky', 'dick', 'rich', 'richie']],
  ['anthony', ['tony']],
  ['matthew', ['matt']],
  ['nicholas', ['nick', 'nicky']],
  ['alexander', ['alex']],
  ['alexandra', ['alex']],
  ['samuel', ['sam']],
  ['samantha', ['sam']],
  ['benjamin', ['ben', 'benny']],
  ['andrew', ['andy', 'drew']],
  ['katherine', ['kate', 'katie', 'kathy']],
  ['kathryn', ['kate', 'katie', 'kathy']],
  ['elizabeth', ['liz', 'beth', 'betty', 'lisa']],
  ['susan', ['sue', 'susie']],
  ['jennifer', ['jen', 'jenny']],
  ['jessica', ['jess', 'jessie']],
  ['amelia', ['amy']],
  ['melissa', ['mel']],
  ['melanie', ['mel']],
  ['patricia', ['pat', 'patty', 'trish']],
  ['patrick', ['pat']],
  ['ann', ['nancy']],
  ['anne', ['nancy']],
  ['margaret', ['peggy', 'maggie', 'meg']],
  ['cynthia', ['cindy']],
  ['amanda', ['mandy']],
  ['sandra', ['sandy']],
  ['rebecca', ['becky']],
  ['deborah', ['debbie', 'deb']],
  ['caroline', ['carol', 'carrie']],
  ['teresa', ['terry']],
  ['terence', ['terry']],
  ['timothy', ['tim']],
  ['gregory', ['greg']],
  ['kenneth', ['ken', 'kenny']],
  ['edward', ['ed', 'eddie', 'ted']],
  ['theodore', ['ted']],
  ['francis', ['frank']],
  ['raymond', ['ray']],
  ['ronald', ['ron', 'ronnie']],
  ['donald', ['don', 'donnie']],
  ['maxwell', ['max']],
  ['maximilian', ['max']],
  ['jacob', ['jake']],
  ['john', ['jack', 'johnny', 'jon', 'sean', 'shane', 'shawn']],
  ['jackson', ['jack']],
  ['jonathan', ['jon']],
  ['joshua', ['josh']],
  ['bradley', ['brad']],
  ['charles', ['chad', 'chuck', 'charlie']],
  ['philip', ['phil']],
  ['peter', ['pete']],
  ['jeffrey', ['jeff']],
  ['gerald', ['jerry']],
  ['jerome', ['jerry']],
  ['lawrence', ['larry']],
  ['barrett', ['barry']],
  ['harold', ['harry']],
  ['henry', ['harry']],
  ['garrett', ['gary']],
  ['albert', ['al']],
  ['arthur', ['art']],
  ['calvin', ['cal']],
  ['cameron', ['cam']],
  ['curtis', ['curt']],
  ['douglas', ['doug']],
  ['eugene', ['gene']],
  ['frederick', ['fred']],
  ['gabriel', ['gabe']],
  ['howard', ['howie']],
  ['jason', ['jay']],
  ['louis', ['lou']],
  ['lucas', ['luke']],
  ['martin', ['marty']],
  ['nathan', ['nate']],
  ['norman', ['norm']],
  ['oliver', ['ollie']],
  ['quinton', ['quinn']],
  ['randall', ['randy']],
  ['russell', ['russ']],
  ['stanley', ['stan']],
  ['stuart', ['stu']],
  ['trevor', ['trev']],
  ['victor', ['vic']],
  ['walter', ['walt']],
  ['wesley', ['wes']],
  ['zachary', ['zach']]
]);

// Helper function to get all name variations for a given name
function getNameVariations(name: string): string[] {
  const normalized = normalizeString(name);
  const variations = NAME_VARIATIONS.get(normalized) || [];
  return [normalized, ...variations];
}

// Helper function to check if one name is a partial match of another
function isPartialNameMatch(name1: string, name2: string): boolean {
  const norm1 = normalizeString(name1);
  const norm2 = normalizeString(name2);
  
  // Check if one name starts with the other (minimum 3 characters)
  if (norm1.length >= 3 && norm2.length >= 3) {
    return norm1.startsWith(norm2) || norm2.startsWith(norm1);
  }
  
  return false;
}

// Fuzzy matching implementation (simplified version of fuzzywuzzy)
function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

function tokenSortRatio(str1: string, str2: string): number {
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  const tokens1 = normalized1.split(/\s+/).filter(t => t.length > 0).sort();
  const tokens2 = normalized2.split(/\s+/).filter(t => t.length > 0).sort();
  
  const sorted1 = tokens1.join(' ');
  const sorted2 = tokens2.join(' ');
  
  return calculateRatio(sorted1, sorted2);
}

function calculateRatio(str1: string, str2: string): number {
  if (str1 === str2) return 100;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 100 : 0;
  if (len2 === 0) return 0;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      const cost = str1[j - 1] === str2[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

// ENHANCED: Multi-step fuzzy matching with nickname and partial name support
function fuzzyMatch(contactFullName: string, tmdbName: string, threshold: number = 90): { isMatch: boolean; score: number; matchType: string } {
  const contactNormalized = normalizeString(contactFullName);
  const tmdbNormalized = normalizeString(tmdbName);
  
  // Step 1: Exact Match (Fastest)
  if (contactNormalized === tmdbNormalized) {
    return { isMatch: true, score: 100, matchType: 'exact' };
  }
  
  
  
  // Step 2: Token Sort Ratio (Current Method)
  const tokenScore = tokenSortRatio(contactNormalized, tmdbNormalized);
  if (tokenScore >= threshold) {
    return { isMatch: true, score: tokenScore, matchType: 'fuzzy' };
  }
  
  // Step 3: NEW - Nickname/Partial Name Check
  // Split both names into first and last name parts
  const contactParts = contactNormalized.split(/\s+/);
  const tmdbParts = tmdbNormalized.split(/\s+/);
  
  if (contactParts.length >= 2 && tmdbParts.length >= 2) {
    const contactFirstName = contactParts[0];
    const contactLastName = contactParts[contactParts.length - 1];
    const tmdbFirstName = tmdbParts[0];
    const tmdbLastName = tmdbParts[tmdbParts.length - 1];
    
    // Check if last names are identical
    if (contactLastName === tmdbLastName) {
      console.log(`🔍 Last names match: "${contactLastName}" = "${tmdbLastName}"`);
      
      // Check for nickname match
      const contactFirstVariations = getNameVariations(contactFirstName);
      const tmdbFirstVariations = getNameVariations(tmdbFirstName);
      
      // Check if any variation of contact first name matches any variation of TMDB first name
      for (const contactVar of contactFirstVariations) {
        for (const tmdbVar of tmdbFirstVariations) {
          if (contactVar === tmdbVar) {
            console.log(`🎯 NICKNAME MATCH: "${contactFirstName}" ↔ "${tmdbFirstName}" (via "${contactVar}")`);
            return { isMatch: true, score: 95, matchType: 'nickname' };
          }
        }
      }
      
      // Check for partial name match (e.g., "Opey" vs "Opeyemi")
      if (isPartialNameMatch(contactFirstName, tmdbFirstName)) {
        console.log(`🎯 PARTIAL NAME MATCH: "${contactFirstName}" ↔ "${tmdbFirstName}"`);
        return { isMatch: true, score: 93, matchType: 'partial' };
      }
    }
  }
  
  // No match found
  return { isMatch: false, score: tokenScore, matchType: 'none' };
}

// TMDB API helper functions
async function tmdbRequest(endpoint: string, apiKey: string): Promise<any> {
  const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${apiKey}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status}`);
  }
  
  return await response.json();
}

function getCurrentWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const start = monday.toISOString().split('T')[0];
  const end = sunday.toISOString().split('T')[0];
  
  return { start, end };
}

// UPDATED: Paginated contact fetching with user ID parameter
async function getAllContactsPaginated(supabase: any, userId: string): Promise<any[]> {
  console.log(`📋 Starting paginated contact fetching for user ID: ${userId}...`);
  
  const allContacts: any[] = [];
  const pageSize = 1000;
  let currentPage = 0;
  let hasMoreData = true;
  
  // Pagination loop: Keep fetching pages until we get less than pageSize records
  while (hasMoreData) {
    // Calculate the range for this page (from and to indices)
    const from = currentPage * pageSize;
    const to = from + pageSize - 1;
    
    console.log(`📄 Fetching contacts page ${currentPage + 1} (contacts ${from + 1} to ${to + 1}) for user ${userId}...`);
    
    // Fetch one page of contacts using Supabase range with user filter
    const { data, error: supabaseError } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId) // CRITICAL: Only fetch specified user's contacts
      .order('created_at', { ascending: false })
      .range(from, to);

    // Check if there was an error fetching this page
    if (supabaseError) {
      throw new Error(`Failed to fetch contacts page ${currentPage + 1}: ${supabaseError.message}`);
    }

    // Add the contacts from this page to our complete list
    if (data && data.length > 0) {
      allContacts.push(...data);
      console.log(`✅ Contacts page ${currentPage + 1} loaded ${data.length} contacts (total so far: ${allContacts.length})`);
    }

    // Check if we should continue to the next page
    // If this page has fewer contacts than pageSize, we've reached the end
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

// ENHANCED: Create First Name Map with nickname variations for ultra-efficient matching
function createFirstNameMap(contacts: any[]): Map<string, any[]> {
  console.log('🗂️ Creating Enhanced First Name Map with nickname variations...');
  
  const firstNameMap = new Map<string, any[]>();
  let totalMappings = 0;
  
  for (const contact of contacts) {
    if (!contact.first_name || !contact.last_name) continue;
    
    // Get all variations of the contact's first name
    const firstNameVariations = getNameVariations(contact.first_name);
    
    // Add contact to map under all variations of their first name
    for (const variation of firstNameVariations) {
      const existingContacts = firstNameMap.get(variation) || [];
      
      // Avoid duplicates
      if (!existingContacts.some(c => c.id === contact.id)) {
        existingContacts.push(contact);
        firstNameMap.set(variation, existingContacts);
        totalMappings++;
      }
    }
  }
  
  console.log(`✅ Enhanced First Name Map created: ${firstNameMap.size} unique name variations, ${totalMappings} total mappings`);
  
  // Log some statistics for debugging
  const mapStats = Array.from(firstNameMap.entries())
    .map(([name, contacts]) => ({ name, count: contacts.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  console.log('📊 Top 10 most common first name variations:');
  mapStats.forEach(stat => {
    console.log(`   "${stat.name}": ${stat.count} contacts`);
  });
  
  return firstNameMap;
}

// ENHANCED: Extract first name and all its variations from TMDB credit name
function extractFirstNameVariations(fullName: string): string[] {
  const normalized = normalizeString(fullName);
  const parts = normalized.split(/\s+/);
  const firstName = parts[0] || '';
  
  if (!firstName) return [];
  
  // Get all variations of this first name
  return getNameVariations(firstName);
}

// Fetch single page of premieres
async function getPremieresSinglePage(page: number, apiKey: string): Promise<{ 
  movies: any[], 
  tvShows: any[], 
  movieTotalPages: number, 
  tvTotalPages: number 
}> {
  const { start, end } = getCurrentWeekRange();
  console.log(`🎬 Fetching page ${page} of premieres from ${start} to ${end}`);
  
  // Fetch movies for this page
  const movieResponse = await tmdbRequest(
    `/discover/movie?primary_release_date.gte=${start}&primary_release_date.lte=${end}&sort_by=primary_release_date.desc&page=${page}`,
    apiKey
  );
  
  // Fetch TV shows for this page
  const tvResponse = await tmdbRequest(
    `/discover/tv?first_air_date.gte=${start}&first_air_date.lte=${end}&sort_by=first_air_date.desc&page=${page}`,
    apiKey
  );
  
  console.log(`📄 Page ${page}: ${movieResponse.results?.length || 0} movies, ${tvResponse.results?.length || 0} TV shows`);
  
  return {
    movies: movieResponse.results || [],
    tvShows: tvResponse.results || [],
    movieTotalPages: movieResponse.total_pages || 0,
    tvTotalPages: tvResponse.total_pages || 0
  };
}

// Simple concurrency limiter for credit fetching
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  
  constructor(private limit: number) {}
  
  async run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next();
          }
        }
      };
      
      if (this.running < this.limit) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }
}

// Fetch credits for premieres on this page
async function getCreditsForPage(premieres: any[], apiKey: string): Promise<Map<string, any>> {
  console.log(`🎭 Fetching credits for ${premieres.length} premieres on this page`);
  
  const creditsMap = new Map<string, any>();
  const limiter = new ConcurrencyLimiter(3); // Reduced to 3 for single page processing
  
  const tasks = premieres.map(premiere => 
    limiter.run(async () => {
      try {
        const credits = await tmdbRequest(`/${premiere.type}/${premiere.id}/credits`, apiKey);
        const key = `${premiere.type}-${premiere.id}`;
        creditsMap.set(key, credits);
        console.log(`✅ Credits fetched for "${premiere.title}" (${premiere.type})`);
        return credits;
      } catch (error) {
        console.error(`❌ Failed to fetch credits for "${premiere.title}":`, error);
        return null;
      }
    })
  );
  
  await Promise.all(tasks);
  console.log(`✅ Credits fetching complete for page: ${creditsMap.size}/${premieres.length} successful`);
  return creditsMap;
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
    // CRITICAL: Parse request body to get page number AND user ID
    const { page = 1, userId } = req.method === 'POST' ? await req.json() : { page: 1, userId: null };
    
    // CRITICAL: Validate that userId is provided
    if (!userId) {
      throw new Error('User ID is required for user-isolated processing');
    }
    
    console.log(`🚀 Processing page ${page} with ENHANCED fuzzy matching for user ${userId}...`);

    // Get environment variables
    const tmdbApiKey = Deno.env.get('TMDB_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!tmdbApiKey) {
      throw new Error('TMDB_API_KEY environment variable is required')
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are required')
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Step 1: Fetch ALL contacts from database using pagination (user-specific)
    const contacts = await getAllContactsPaginated(supabase, userId);

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          matches: [], 
          nextPage: null,
          message: `No contacts found for user ${userId}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Step 1.5: Create Enhanced First Name Map with nickname variations
    const firstNameMap = createFirstNameMap(contacts);

    // Step 2: Fetch single page of premieres
    const { movies, tvShows, movieTotalPages, tvTotalPages } = await getPremieresSinglePage(page, tmdbApiKey);

    // Combine and format premieres for this page
    const pagePremieres = [
      ...movies.map(movie => ({
        id: movie.id,
        title: movie.title,
        releaseDate: movie.release_date,
        type: 'movie' as const,
        overview: movie.overview,
        posterPath: movie.poster_path
      })),
      ...tvShows.map(show => ({
        id: show.id,
        title: show.name,
        releaseDate: show.first_air_date,
        type: 'tv' as const,
        overview: show.overview,
        posterPath: show.poster_path
      }))
    ].filter(item => item.releaseDate)
     .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())

    console.log(`🎯 Page ${page} premieres to process for user ${userId}: ${pagePremieres.length}`)

    // Step 3: Fetch credits for this page's premieres
    const creditsMap = await getCreditsForPage(pagePremieres, tmdbApiKey);

    // Step 4: ENHANCED MATCHING using First Name Map + Nickname/Partial Name Support
    console.log(`🚀 Performing ENHANCED fuzzy matching with nickname and partial name support for user ${userId}...`)
    const matches: any[] = []
    const FUZZY_THRESHOLD = 90
    let totalCreditsProcessed = 0;
    let totalComparisons = 0;
    let totalSkipped = 0;
    let nicknameMatches = 0;
    let partialMatches = 0;
    let exactMatches = 0;
    let fuzzyMatches = 0;

    for (const premiere of pagePremieres) {
      const creditsKey = `${premiere.type}-${premiere.id}`;
      const credits = creditsMap.get(creditsKey);
      
      if (!credits) {
        console.log(`⚠️ No credits available for "${premiere.title}", skipping`);
        continue;
      }

      const allCredits = [...(credits.cast || []), ...(credits.crew || [])];
      totalCreditsProcessed += allCredits.length;
      console.log(`🔍 Checking "${premiere.title}" with ${allCredits.length} cast + crew members`);

      // ENHANCED: Check each credit using First Name Map with nickname variations
      for (const credit of allCredits) {
        const tmdbName = credit.name?.trim()
        if (!tmdbName) continue

        const role = 'character' in credit ? 
          `Actor as ${credit.character}` : 
          (credit.job || 'crew member')

        // ENHANCED: Extract first name and all its variations from TMDB credit
        const creditFirstNameVariations = extractFirstNameVariations(tmdbName);
        
        if (creditFirstNameVariations.length === 0) {
          totalSkipped++;
          continue;
        }

        // ENHANCED: Look up potential contacts by ALL first name variations
        const potentialContactsSet = new Set<any>();
        
        for (const variation of creditFirstNameVariations) {
          const contactsForVariation = firstNameMap.get(variation);
          if (contactsForVariation) {
            contactsForVariation.forEach(contact => potentialContactsSet.add(contact));
          }
        }
        
        const potentialContacts = Array.from(potentialContactsSet);
        
        if (potentialContacts.length === 0) {
          // No contacts with any variation of this first name - skip expensive fuzzy matching
          totalSkipped++;
          continue;
        }

        console.log(`🎯 "${tmdbName}" (variations: [${creditFirstNameVariations.join(', ')}]) → checking ${potentialContacts.length} potential contacts`);

        // ENHANCED: Perform enhanced fuzzy matching on the subset
        for (const contact of potentialContacts) {
          if (!contact.first_name || !contact.last_name) continue

          const contactFullName = `${contact.first_name} ${contact.last_name}`
          const matchResult = fuzzyMatch(contactFullName, tmdbName, FUZZY_THRESHOLD)
          totalComparisons++;

          if (matchResult.isMatch) {
            // Track match types for statistics
            switch (matchResult.matchType) {
              case 'exact': exactMatches++; break;
              case 'fuzzy': fuzzyMatches++; break;
              case 'nickname': nicknameMatches++; break;
              case 'partial': partialMatches++; break;
            }
            
            console.log(`🎯 ${matchResult.matchType.toUpperCase()} MATCH: ${contactFullName} = ${tmdbName} in "${premiere.title}" (${matchResult.score}%)`)
            
            matches.push({
              id: `${premiere.id}-${contact.id}`,
              contactId: contact.id,
              contactName: contactFullName,
              contactEmail: contact.email,
              contactCategory: contact.category || 'OTHER',
              premiere: {
                id: premiere.id,
                title: premiere.title,
                type: premiere.type,
                releaseDate: premiere.releaseDate,
                overview: premiere.overview,
                posterPath: premiere.posterPath
              },
              role: role,
              character: 'character' in credit ? credit.character : undefined,
              job: 'job' in credit ? credit.job : undefined,
              department: 'department' in credit ? credit.department : undefined,
              matchScore: matchResult.score,
              matchType: matchResult.matchType,
              foundAt: new Date().toISOString()
            })
          }
        }
      }
    }

    // Step 5: Determine next page
    const maxTotalPages = Math.max(movieTotalPages, tvTotalPages);
    const nextPage = page < maxTotalPages ? page + 1 : null;

    // Performance and accuracy statistics
    const potentialBruteForceComparisons = totalCreditsProcessed * contacts.length;
    const efficiencyGain = potentialBruteForceComparisons > 0 ? 
      ((potentialBruteForceComparisons - totalComparisons) / potentialBruteForceComparisons * 100).toFixed(1) : 0;

    console.log(`✅ Page ${page} ENHANCED processing complete for user ${userId}:`);
    console.log(`   🎯 Total matches found: ${matches.length}`);
    console.log(`   📊 Match breakdown:`);
    console.log(`      🎯 Exact matches: ${exactMatches}`);
    console.log(`      🔍 Fuzzy matches: ${fuzzyMatches}`);
    console.log(`      🏷️ Nickname matches: ${nicknameMatches}`);
    console.log(`      ✂️ Partial name matches: ${partialMatches}`);
    console.log(`   📊 Credits processed: ${totalCreditsProcessed}`);
    console.log(`   🔍 Actual comparisons: ${totalComparisons}`);
    console.log(`   ⚡ Credits skipped (no name match): ${totalSkipped}`);
    console.log(`   🚀 Efficiency gain: ${efficiencyGain}% (avoided ${potentialBruteForceComparisons - totalComparisons} comparisons)`);
    console.log(`📄 Next page: ${nextPage} (max total pages: ${maxTotalPages})`);

    // Return the matches for this page
    return new Response(
      JSON.stringify({ 
        success: true, 
        matches,
        nextPage,
        pageInfo: {
          currentPage: page,
          totalPages: maxTotalPages,
          moviesOnPage: movies.length,
          tvShowsOnPage: tvShows.length,
          premieresProcessed: pagePremieres.length,
          matchesFound: matches.length,
          creditsProcessed: totalCreditsProcessed,
          comparisonsPerformed: totalComparisons,
          creditsSkipped: totalSkipped,
          efficiencyGain: `${efficiencyGain}%`,
          matchBreakdown: {
            exact: exactMatches,
            fuzzy: fuzzyMatches,
            nickname: nicknameMatches,
            partial: partialMatches
          }
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
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        matches: [],
        nextPage: null
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})