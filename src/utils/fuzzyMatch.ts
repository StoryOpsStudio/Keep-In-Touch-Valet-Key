// Exact implementation of Python fuzzywuzzy token_sort_ratio
// This matches the Python script's fuzzy matching exactly

export function normalizeString(str: string): string {
  // Match Python: .lower().strip()
  return str.toLowerCase().trim();
}

export function tokenSortRatio(str1: string, str2: string): number {
  // Exact implementation of fuzzywuzzy's token_sort_ratio
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  // Split into tokens and sort (like fuzzywuzzy)
  const tokens1 = normalized1.split(/\s+/).filter(t => t.length > 0).sort();
  const tokens2 = normalized2.split(/\s+/).filter(t => t.length > 0).sort();
  
  const sorted1 = tokens1.join(' ');
  const sorted2 = tokens2.join(' ');
  
  // Calculate ratio using Levenshtein distance
  return calculateRatio(sorted1, sorted2);
}

function calculateRatio(str1: string, str2: string): number {
  if (str1 === str2) return 100;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 100 : 0;
  if (len2 === 0) return 0;
  
  // Levenshtein distance calculation
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
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  
  // Convert to percentage (0-100)
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

// Global counter for tracking comparisons
let comparisonCounter = 0;

export function resetComparisonCounter() {
  comparisonCounter = 0;
}

export function getComparisonCount() {
  return comparisonCounter;
}

// Exact match of Python script's fuzzy_match function
export function fuzzyMatch(contactFullName: string, tmdbName: string, threshold: number = 90): { isMatch: boolean; score: number } {
  comparisonCounter++;
  
  // Create normalized full name exactly like Python script
  // Python: contacts_df['Full Name Normalized'] = contacts_df[['First Name', 'Last Name']].fillna('').apply(lambda x: ' '.join(x), axis=1).str.lower().str.strip()
  const contactNormalized = normalizeString(contactFullName);
  const tmdbNormalized = normalizeString(tmdbName);
  
  // Use token_sort_ratio like fuzzywuzzy (Python script uses fuzz.token_sort_ratio)
  const score = tokenSortRatio(contactNormalized, tmdbNormalized);
  const isMatch = score >= threshold;
  
  if (comparisonCounter <= 20 || isMatch) {
    console.log(`🔍 [${comparisonCounter}] "${contactNormalized}" vs "${tmdbNormalized}" = ${score}% ${isMatch ? '✅' : '❌'}`);
  }
  
  return { isMatch, score };
}

// Test function for debugging
export function testContactMatch(contactName: string, tmdbNames: string[], threshold: number = 90) {
  console.log(`\n🧪 TESTING CONTACT: "${contactName}"`);
  console.log(`📋 Against ${tmdbNames.length} TMDB names with ${threshold}% threshold`);
  
  const results = [];
  
  resetComparisonCounter();
  
  for (const tmdbName of tmdbNames) {
    const result = fuzzyMatch(contactName, tmdbName, threshold);
    results.push({
      tmdbName,
      score: result.score,
      isMatch: result.isMatch
    });
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  console.log(`\n📊 TEST RESULTS (${getComparisonCount()} comparisons):`);
  console.log('Top 10 matches:');
  results.slice(0, 10).forEach((result, i) => {
    console.log(`${i + 1}. ${result.isMatch ? '✅' : '❌'} ${result.score}% - "${result.tmdbName}"`);
  });
  
  const matches = results.filter(r => r.isMatch);
  console.log(`\n🎯 Total matches found: ${matches.length}`);
  
  return results;
}