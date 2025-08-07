import { useState, useEffect } from 'react';
import { X, Copy, Mail, CheckCircle, AlertCircle, Send, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { NewsMatch } from '../services/newsService';
import { useContactStore } from '../store/contactStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';
import { 
  generateSubjectLine, 
  generateMailtoLink, 
  isValidEmail,
  EmailContext 
} from '../utils/emailUtils';

// Define types for different match types
interface PremiereMatch {
  id: string;
  contactName: string;
  contactEmail?: string;
  premiere: {
    title: string;
    type: 'movie' | 'tv';
    releaseDate: string;
  };
  role: string;
}

type MatchType = NewsMatch | PremiereMatch;

interface EmailDraftModalProps {
  match: MatchType;
  onClose: () => void;
}

// Type guard to check if match is a NewsMatch
const isNewsMatch = (match: MatchType): match is NewsMatch => {
  return 'articleTitle' in match;
};

// Type guard to check if match is a PremiereMatch
const isPremiereMatch = (match: MatchType): match is PremiereMatch => {
  return 'premiere' in match;
};

// UPDATED: State machine for AI drafting status
type DraftStatus = 'drafting' | 'success' | 'error';

export function EmailDraftModal({ match, onClose }: EmailDraftModalProps) {
  const { user } = useAuthStore();
  const { contacts } = useContactStore();
  
  // State management for subject and body
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  // UPDATED: State machine for AI drafting
  const [status, setStatus] = useState<DraftStatus>('drafting');
  const [draftingError, setDraftingError] = useState<string | null>(null);

  // Find the complete contact object from the store
  const contact = isNewsMatch(match) 
    ? contacts.find(c => c.id.toString() === match.contactId)
    : contacts.find(c => `${c.first_name} ${c.last_name}` === match.contactName);

  // Extract contact information with proper fallbacks
  const contactName = match.contactName;
  const contactFirstName = contactName.split(' ')[0];
  const contactEmail = contact?.email || 
    (isPremiereMatch(match) ? match.contactEmail : undefined);

  // Generate context for email templates
  const getEmailContext = (): EmailContext => {
    if (isNewsMatch(match)) {
      return {
        type: 'news',
        title: match.articleTitle,
        publication: match.publication,
        matchLocation: match.matchLocation
      };
    } else if (isPremiereMatch(match)) {
      return {
        type: 'premiere',
        title: match.premiere.title,
        premiereType: match.premiere.type,
        releaseDate: match.premiere.releaseDate
      };
    }
    
    // Fallback
    return {
      type: 'news',
      title: 'Recent News',
      publication: 'industry news'
    };
  };

  // UPDATED: State machine-based AI draft generation
  const handleGenerateDraft = async () => {
    if (!user) {
      setDraftingError('User not authenticated');
      setStatus('error');
      return;
    }

    // CRITICAL: Set status to 'drafting' at the very start
    setStatus('drafting');
    setDraftingError(null);

    try {
      console.log('🤖 [EmailDraftModal] Generating enhanced contextual AI email draft...');

      // ENHANCED: Prepare match context with full article URL for deep analysis
      let matchContext: any = {
        contactName: contactName
      };

      if (isNewsMatch(match)) {
        matchContext = {
          ...matchContext,
          type: 'news',
          articleTitle: match.articleTitle,
          publication: match.publication,
          articleUrl: match.articleUrl // NEW: Include article URL for full content analysis
        };
      } else if (isPremiereMatch(match)) {
        matchContext = {
          ...matchContext,
          type: 'premiere',
          premiereTitle: match.premiere.title,
          premiereType: match.premiere.type,
          releaseDate: match.premiere.releaseDate
        };
      }

      console.log('📄 [EmailDraftModal] Match context prepared with enhanced data:', matchContext);

      // Call the ENHANCED AI email drafting Edge Function
      const { data, error } = await supabase.functions.invoke('generate-email-draft', {
        body: {
          userId: user.id,
          matchContext
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate email draft');
      }

      if (!data.success) {
        throw new Error(data.error || 'AI email generation failed');
      }

      // FIXED: Correctly parse the AI response to separate subject and body
      const rawAIResponse = data.emailBody; // The full string from the AI, e.g., "Subject: Congrats!\n\nHey Ari..."

      let finalSubject = 'Congrats!'; // A safe default subject
      let finalBody = '';

      // Find the index of the first double newline, which separates header from body
      const firstDoubleNewlineIndex = rawAIResponse.indexOf('\n\n');

      if (firstDoubleNewlineIndex !== -1) {
        // Extract the header part (the first line)
        const headerPart = rawAIResponse.substring(0, firstDoubleNewlineIndex).trim();
        
        // Extract the body part (everything after the first double newline)
        finalBody = rawAIResponse.substring(firstDoubleNewlineIndex + 2).trim();

        // Clean up the subject line by removing the "Subject: " prefix
        if (headerPart.toLowerCase().startsWith('subject:')) {
          finalSubject = headerPart.substring(8).trim();
        } else {
          // If the AI didn't follow the format, use the whole first line as subject
          finalSubject = headerPart;
        }
      } else {
        // Fallback if the AI response has no double newline
        // We'll assume the whole response is the body and use our default subject
        finalBody = rawAIResponse.trim();
      }

      // Set the state for BOTH UI elements with the correctly parsed data
      setSubject(finalSubject);
      setEmailBody(finalBody);
      
      // CRITICAL: Set status to 'success' when done
      setStatus('success');
      
      // Log enhanced metadata if available
      if (data.metadata) {
        console.log('✅ [EmailDraftModal] Enhanced AI email draft generated:', {
          characterCount: data.metadata.characterCount,
          hasFullArticleContent: data.metadata.hasFullArticleContent,
          analysisMethod: data.metadata.analysisMethod,
          voiceProfileUsed: data.metadata.voiceProfileUsed
        });
      }

    } catch (error) {
      console.error('❌ [EmailDraftModal] Enhanced AI drafting error:', error);
      setDraftingError(error instanceof Error ? error.message : 'Failed to generate email draft');
      
      // CRITICAL: Set status to 'error' on failure
      setStatus('error');
    }
  };

  // UPDATED: Initialize with loading message and trigger initial AI draft
  useEffect(() => {
    // Set loading message for subject while AI generates
    setSubject('Generating subject...');

    // Automatically generate enhanced AI draft when modal opens
    handleGenerateDraft();
  }, []); // Empty dependency array - only run once when modal mounts

  // Copy current edited content to clipboard
  const handleCopyToClipboard = async () => {
    try {
      const fullEmail = `Subject: ${subject}\n\n${emailBody}`;
      await navigator.clipboard.writeText(fullEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Use current edited subject and body in mailto link
  const handleOpenInEmailApp = () => {
    if (!contactEmail || !isValidEmail(contactEmail)) {
      alert('No valid email address available for this contact.');
      return;
    }

    const mailtoLink = generateMailtoLink(contactEmail, subject, emailBody);
    window.open(mailtoLink, '_blank');
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 3000);
  };

  // Handle backdrop click to close modal
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Get match details for display
  const getMatchDetails = () => {
    if (isNewsMatch(match)) {
      return {
        title: match.articleTitle,
        subtitle: `${match.publication.charAt(0).toUpperCase() + match.publication.slice(1)} Article`,
        icon: '📰'
      };
    } else if (isPremiereMatch(match)) {
      return {
        title: match.premiere.title,
        subtitle: `${match.premiere.type === 'movie' ? 'Movie' : 'TV Show'} Premiere`,
        icon: match.premiere.type === 'movie' ? '🎬' : '📺'
      };
    }
    
    return {
      title: 'Unknown Match',
      subtitle: 'Contact Match',
      icon: '📧'
    };
  };

  const matchDetails = getMatchDetails();

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Enhanced AI Email to {contactFirstName}</h2>
                <p className="text-blue-100 text-sm flex items-center space-x-2">
                  <Sparkles className="h-4 w-4" />
                  <span>{matchDetails.icon} {matchDetails.subtitle} • Deep Context Analysis</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {/* Match Context */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Context: {matchDetails.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {isNewsMatch(match) && `Found in ${match.publication} article • AI analyzing full content for sentiment`}
              {isPremiereMatch(match) && `${match.role} in upcoming ${match.premiere.type} • AI analyzing premiere context`}
            </p>
          </div>

          {/* Contact Information */}
          <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                To: {contactName}
              </p>
              {contactEmail && isValidEmail(contactEmail) ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {contactEmail}
                </p>
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center space-x-1">
                  <AlertCircle className="h-4 w-4" />
                  <span>No email address available</span>
                </p>
              )}
            </div>
          </div>

          {/* Subject Line input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={status === 'drafting'}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors disabled:opacity-50"
              placeholder="Enter email subject..."
            />
          </div>

          {/* UPDATED: State machine-based AI Drafting Status */}
          {status === 'drafting' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-center space-x-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-300">
                    AI is analyzing context and drafting your email...
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    {isNewsMatch(match) 
                      ? '• Reading full article content for sentiment analysis'
                      : '• Analyzing premiere context and timing'
                    }
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    • Applying your personal voice profile for authentic tone
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* UPDATED: State machine-based Error Display */}
          {status === 'error' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-center space-x-2 mb-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-300">
                    Enhanced AI Drafting Failed
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {draftingError}
                  </p>
                </div>
              </div>
              <button
                onClick={handleGenerateDraft}
                disabled={status === 'drafting'}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Try Enhanced Analysis Again</span>
              </button>
            </div>
          )}

          {/* Email Body textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email Body
            </label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              disabled={status === 'drafting'}
              rows={12}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none transition-colors disabled:opacity-50"
              placeholder={status === 'drafting' ? "AI is performing deep contextual analysis and generating your personalized email..." : "Your contextually-aware email message..."}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {status === 'drafting' ? (
                  <span className="flex items-center space-x-1">
                    <Sparkles className="h-3 w-3" />
                    <span>Enhanced AI analysis in progress...</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1">
                    <Sparkles className="h-3 w-3" />
                    <span>AI-generated with deep contextual understanding • Edit as needed</span>
                  </span>
                )}
              </p>
              {/* UPDATED: State machine-based Regenerate button */}
              {status !== 'drafting' && (
                <button
                  onClick={handleGenerateDraft}
                  disabled={status === 'drafting'}
                  className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Re-analyze & Generate</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-600">
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
            <span>{emailBody.length} characters</span>
            {status === 'drafting' && (
              <span className="flex items-center space-x-1 text-blue-600 dark:text-blue-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Analyzing...</span>
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            {/* UPDATED: State machine-based Regenerate button */}
            <button
              onClick={handleGenerateDraft}
              disabled={status === 'drafting'}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                status === 'drafting'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:hover:bg-purple-800'
              }`}
            >
              {status === 'drafting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Re-analyze</span>
                </>
              )}
            </button>

            {/* UPDATED: State machine-based Copy button */}
            <button
              onClick={handleCopyToClipboard}
              disabled={status === 'drafting' || !emailBody}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                copied
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* UPDATED: State machine-based Email app button */}
            <button
              onClick={handleOpenInEmailApp}
              disabled={status === 'drafting' || !emailBody || !contactEmail || !isValidEmail(contactEmail)}
              className={`flex items-center space-x-2 px-6 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                emailSent
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {emailSent ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>Opened!</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Open in Email App</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}