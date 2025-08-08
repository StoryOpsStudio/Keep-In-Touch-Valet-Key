// TODO: Move API key to backend proxy before production
const TMDB_API_KEY = 'b712527a7f592abbad39ad2a0261f6aa';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
}

export interface TMDBTVShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview: string;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TMDBCredits {
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

class TMDBService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour

  private async request(endpoint: string): Promise<any> {
    const cacheKey = endpoint;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`);
      }
      
      const data = await response.json();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error('TMDB API request failed:', error);
      throw error;
    }
  }

  // Match Python script's week calculation EXACTLY
  getCurrentWeekRange() {
    const today = new Date();
    
    // Python: start_date = today - timedelta(days=today.weekday())
    // In Python, Monday = 0, Sunday = 6
    // In JS, Sunday = 0, Monday = 1, so we need to adjust
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Python weekday
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);
    
    // Python: end_date = start_date + timedelta(days=6)
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const start = monday.toISOString().split('T')[0];
    const end = sunday.toISOString().split('T')[0];
    
    console.log(`📅 Week range (Python style): ${start} to ${end}`);
    console.log(`📅 Today: ${today.toISOString().split('T')[0]} (${today.toLocaleDateString('en-US', { weekday: 'long' })})`);
    
    return { start, end };
  }

  // Fetch ALL movies for the week (like Python script)
  async getMoviesThisWeek(): Promise<TMDBMovie[]> {
    const { start, end } = this.getCurrentWeekRange();
    
    console.log(`🎬 Fetching movies from ${start} to ${end}`);
    
    const allResults: TMDBMovie[] = [];
    let page = 1;
    
    while (true) {
      const response = await this.request(
        `/discover/movie?primary_release_date.gte=${start}&primary_release_date.lte=${end}&sort_by=primary_release_date.desc&page=${page}`
      );
      
      if (!response.results || response.results.length === 0) {
        break;
      }
      
      allResults.push(...response.results);
      
      console.log(`📄 Movies page ${page}: ${response.results.length} results (total: ${allResults.length})`);
      
      if (page >= response.total_pages) {
        break;
      }
      
      page++;
      
      // Prevent infinite loops
      if (page > 50) {
        console.warn('⚠️ Stopping movie fetch at page 50 to prevent infinite loop');
        break;
      }
    }
    
    console.log(`🎬 Total movies found: ${allResults.length}`);
    return allResults;
  }

  // Fetch ALL TV shows for the week (like Python script)
  async getTVShowsThisWeek(): Promise<TMDBTVShow[]> {
    const { start, end } = this.getCurrentWeekRange();
    
    console.log(`📺 Fetching TV shows from ${start} to ${end}`);
    
    const allResults: TMDBTVShow[] = [];
    let page = 1;
    
    while (true) {
      const response = await this.request(
        `/discover/tv?first_air_date.gte=${start}&first_air_date.lte=${end}&sort_by=first_air_date.desc&page=${page}`
      );
      
      if (!response.results || response.results.length === 0) {
        break;
      }
      
      allResults.push(...response.results);
      
      console.log(`📄 TV page ${page}: ${response.results.length} results (total: ${allResults.length})`);
      
      if (page >= response.total_pages) {
        break;
      }
      
      page++;
      
      // Prevent infinite loops
      if (page > 50) {
        console.warn('⚠️ Stopping TV fetch at page 50 to prevent infinite loop');
        break;
      }
    }
    
    console.log(`📺 Total TV shows found: ${allResults.length}`);
    return allResults;
  }

  async getMovieCredits(movieId: number): Promise<TMDBCredits> {
    return await this.request(`/movie/${movieId}/credits`);
  }

  async getTVCredits(tvId: number): Promise<TMDBCredits> {
    return await this.request(`/tv/${tvId}/credits`);
  }

  getPosterUrl(posterPath: string | null, size: string = 'w300'): string | null {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
  }

  getProfileUrl(profilePath: string | null, size: string = 'w185'): string | null {
    if (!profilePath) return null;
    return `https://image.tmdb.org/t/p/${size}${profilePath}`;
  }
}

export const tmdbService = new TMDBService();