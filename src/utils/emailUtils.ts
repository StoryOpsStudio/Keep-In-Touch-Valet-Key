// Dynamic, context-aware email template generator
// Supports both news articles and premiere matches with intelligent personalization

// Define types for context to make the function robust
export interface NewsContext {
  type: 'news';
  title: string;
  publication: string; // e.g., "Deadline", "Variety", "The Hollywood Reporter"
  matchLocation?: string; // e.g., "title", "description", "full"
}

export interface PremiereContext {
  type: 'premiere';
  title: string;
  premiereType: 'movie' | 'tv'; // Movie or TV show
  releaseDate?: string;
}

export type EmailContext = NewsContext | PremiereContext;

// Get user's name (can be made dynamic later)
const getUserName = (): string => {
  return "Rob"; // TODO: Make this configurable in user settings
};

// Get publication display name
const getPublicationName = (publication: string): string => {
  const names: Record<string, string> = {
    deadline: 'Deadline',
    variety: 'Variety',
    thr: 'The Hollywood Reporter'
  };
  return names[publication] || publication;
};

// Generate subject line based on context
export const generateSubjectLine = (contactFirstName: string, context: EmailContext): string => {
  if (context.type === 'news') {
    return `Congrats on "${context.title}"!`;
  } else {
    const contentType = context.premiereType === 'movie' ? 'film' : 'show';
    return `Congrats on the "${context.title}" premiere!`;
  }
};

// Generate email body with dynamic, context-aware templates
export const getPlaceholderDraft = (contactFirstName: string, context: EmailContext): string => {
  const yourName = getUserName();

  if (context.type === 'news') {
    return generateNewsTemplate(contactFirstName, context, yourName);
  } else {
    return generatePremiereTemplate(contactFirstName, context, yourName);
  }
};

// News article templates with publication-specific variations
const generateNewsTemplate = (contactFirstName: string, context: NewsContext, yourName: string): string => {
  const publicationName = getPublicationName(context.publication);
  
  // Different templates based on match location for more natural language
  const titleMatchTemplates = [
    `Hi ${contactFirstName},\n\nI just saw the great news on ${publicationName} about "${context.title}" and wanted to reach out and say congratulations! That's a huge accomplishment.\n\nHope you're doing well and we can connect soon.\n\nBest,\n${yourName}`,
    
    `Hey ${contactFirstName},\n\nJust read the news via ${publicationName} about "${context.title}" – wanted to send a quick note to say congrats! Really exciting stuff.\n\nWould love to catch up soon.\n\nAll the best,\n${yourName}`,
    
    `${contactFirstName},\n\nSaw your name in ${publicationName} regarding "${context.title}" and had to reach out! Congratulations on this fantastic news.\n\nHope we can celebrate in person soon.\n\nWarmly,\n${yourName}`
  ];

  const contentMatchTemplates = [
    `Hi ${contactFirstName},\n\nI was reading ${publicationName} and came across "${context.title}" where you were mentioned. Wanted to drop a line and say congratulations!\n\nHope you're doing well.\n\nBest regards,\n${yourName}`,
    
    `Hey ${contactFirstName},\n\nJust saw your involvement in "${context.title}" covered by ${publicationName}. That's fantastic news! \n\nWould love to hear more about it when you have a chance.\n\nCheers,\n${yourName}`
  ];

  // Choose template based on match location
  const templates = context.matchLocation === 'title' ? titleMatchTemplates : contentMatchTemplates;
  return templates[Math.floor(Math.random() * templates.length)];
};

// Premiere templates with movie/TV show variations
const generatePremiereTemplate = (contactFirstName: string, context: PremiereContext, yourName: string): string => {
  const contentType = context.premiereType === 'movie' ? 'film' : 'show';
  const action = context.premiereType === 'movie' ? 'see it' : 'watch it';
  
  const premiereTemplates = [
    `Hey ${contactFirstName},\n\nJust dropping a line to wish you all the best with the premiere of "${context.title}"! Hope the ${contentType} does amazingly well.\n\nCan't wait to ${action}!\n\nWarmly,\n${yourName}`,
    
    `Hi ${contactFirstName},\n\nI saw that "${context.title}" premieres this week and wanted to send my congratulations! Really excited to ${action}.\n\nHope you're well!\n\nBest,\n${yourName}`,
    
    `${contactFirstName},\n\nCongratulations on "${context.title}" premiering! What an exciting milestone. I'm sure the ${contentType} will be a huge success.\n\nLooking forward to checking it out.\n\nAll the best,\n${yourName}`,
    
    `Hey ${contactFirstName},\n\nSaw that "${context.title}" is premiering and wanted to reach out with congratulations! Must be such an exciting time for you.\n\nHope we can catch up soon.\n\nCheers,\n${yourName}`
  ];

  return premiereTemplates[Math.floor(Math.random() * premiereTemplates.length)];
};

// Generate mailto link for email apps
export const generateMailtoLink = (
  email: string, 
  subject: string, 
  body: string
): string => {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  return `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`;
};

// Validate email address
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};