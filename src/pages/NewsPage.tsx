import { useState, useEffect, useRef } from 'react';
import { 
  Newspaper, 
  Clock, 
  RefreshCw, 
  Settings, 
  Bell, 
  BellOff,
  ExternalLink,
  Mail,
  Eye,
  EyeOff,
  Trash2,
  AlertCircle,
  CheckCircle,
  Users,
  Calendar,
  Loader2
} from 'lucide-react';
import { useNewsStore } from '../store/newsStore';
import { useLegacyContacts } from '../store/contactStore';
import { NewsMatch } from '../services/newsService';
import { EmailDraftModal } from '../components/EmailDraftModal';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';

export function NewsPage() {
  const { user } = useAuthStore(); // Get authenticated user
  const hasTriggeredInitialScan = useRef(false);
  const {
    matches: storedMatches,
    unreadCount,
    lastCheck,
    nextCheck,
    autoCheckEnabled,
    setAutoCheckEnabled,
    markAsRead,
    markAllAsRead,
    clearMatches,
    removeMatch,
    hasPerformedInitialScan,
    setInitialScanPerformed,
    setLastCheck,
    prepareForNewCheck, // UPDATED: Use the new consolidated action
    isChecking,
    setIsChecking,
    fetchInitialMatches
  } = useNewsStore();

  const { contacts: legacyContacts, isLoading: contactsLoading } = useLegacyContacts();
  
  const [timeUntilNext, setTimeUntilNext] = useState<string>('');
  
  const [showSettings, setShowSettings] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [selectedPublication, setSelectedPublication] = useState<string>('all');

  // Email drafting modal state
  const [draftingMatch, setDraftingMatch] = useState<NewsMatch | null>(null);

  // Fetch initial matches when user is authenticated
  useEffect(() => {
    if (user) {
      fetchInitialMatches();
    }
  }, [user, fetchInitialMatches]);

// First-Visit Deep Scan Logic
useEffect(() => {
  if (!hasTriggeredInitialScan.current && !hasPerformedInitialScan && legacyContacts.length > 0 && !contactsLoading && user) {
    hasTriggeredInitialScan.current = true; // Set immediately to prevent duplicates
    console.log(`🚀 [NewsPage] First visit to News tab this session for user ${user.email}. Triggering initial scan.`);
    setInitialScanPerformed(); 
    handleCheckNow();
  }
}, [hasPerformedInitialScan, legacyContacts.length, contactsLoading, setInitialScanPerformed, user]);

  // Update countdown timer
  useEffect(() => {
    if (!nextCheck || !autoCheckEnabled) {
      setTimeUntilNext('');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const next = new Date(nextCheck).getTime();
      const diff = next - now;

      if (diff <= 0) {
        setTimeUntilNext('Checking now...');
        return;
      }

      const minutes = Math.floor(diff / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (minutes > 0) {
        setTimeUntilNext(`${minutes}m ${seconds}s`);
      } else {
        setTimeUntilNext(`${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [nextCheck, autoCheckEnabled]);

  const handleToggleAutoCheck = () => {
    setAutoCheckEnabled(!autoCheckEnabled);
  };

  // UPDATED: Consolidated state management - no more race conditions
  const handleCheckNow = async () => {
    // CRITICAL: Single source of truth for state preparation
    prepareForNewCheck();
    console.log('🔄 [NewsPage] State preparation completed - starting fresh news check');

    // CRITICAL: Ensure user is authenticated
    if (!user) {
      console.log('⚠️ [NewsPage] User not authenticated, cannot check news');
      setIsChecking(false); // Reset state if auth fails
      return;
    }

    if (contactsLoading || legacyContacts.length === 0) {
      console.log('⚠️ [NewsPage] No contacts available for processing');
      setIsChecking(false); // Reset state if no contacts
      return;
    }

    console.log(`🚀 [NewsPage] Kicking off backend news processing for user ${user.email}...`);

    try {
      // SIMPLE: Single call to kick off the backend process with user ID
      const { data, error: functionError } = await supabase.functions.invoke('get-news-matches', {
        method: 'POST',
        body: { userId: user.id } // Pass authenticated user ID
      });

      if (functionError) {
        console.error(`❌ [NewsPage] Backend function error:`, functionError);
      } else {
        console.log(`✅ [NewsPage] Backend processing initiated for user ${user.email}:`, data);
        setLastCheck(new Date());
      }

    } catch (error) {
      console.error('❌ [NewsPage] Failed to start news processing:', error);
    } finally {
      // CRITICAL: Always reset checking state in finally block
      setIsChecking(false);
    }
  };

  const handleMarkAsRead = (matchId: string) => {
    markAsRead(matchId);
  };

  const handleRemoveMatch = (matchId: string) => {
    if (window.confirm('Remove this match? This cannot be undone.')) {
      removeMatch(matchId);
    }
  };

  const handleEmailContact = (match: NewsMatch) => {
    setDraftingMatch(match);
  };

  // Filter and sort matches
  const filteredMatches = storedMatches.filter(match => {
    if (selectedPublication !== 'all' && match.publication !== selectedPublication) {
      return false;
    }
    if (!showAllMatches && match.isRead) {
      return false;
    }
    return true;
  });

  const sortedMatches = filteredMatches.sort((a, b) => {
    return new Date(b.foundAt).getTime() - new Date(a.foundAt).getTime();
  });

  const publicationStats = {
    deadline: storedMatches.filter(m => m.publication === 'deadline').length,
    variety: storedMatches.filter(m => m.publication === 'variety').length,
    thr: storedMatches.filter(m => m.publication === 'thr').length
  };

  const formatTimeAgo = (date: Date) => {
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const getMatchQuality = (match: NewsMatch): { icon: string; label: string; description: string } => {
    const sourceIcon = '🤖'; // WordPress API icon
    
    switch (match.matchLocation) {
      case 'title':
        return {
          icon: `🏆 ${sourceIcon}`,
          label: 'Title Match',
          description: `Contact mentioned in article headline (WordPress API)`
        };
      case 'description':
      case 'excerpt':
        return {
          icon: `📝 ${sourceIcon}`,
          label: 'Excerpt Match',
          description: `Contact mentioned in article excerpt (WordPress API)`
        };
      case 'full':
        return {
          icon: `🤖 ${sourceIcon}`,
          label: 'Full Content Match',
          description: `Contact found in complete article text (WordPress API)`
        };
      default:
        return {
          icon: `📰 ${sourceIcon}`,
          label: 'News Match',
          description: `Contact found in article (WordPress API)`
        };
    }
  };

  const getPublicationName = (publication: string): string => {
    const names = {
      deadline: 'Deadline',
      variety: 'Variety',
      thr: 'The Hollywood Reporter'
    };
    return names[publication as keyof typeof names] || publication;
  };

  // Guard clause: Ensure user is authenticated
  if (!user) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            News Monitoring
          </h1>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-8">
            <AlertCircle className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
              Authentication Required
            </h3>
            <p className="text-yellow-700 dark:text-yellow-400">
              Please log in to monitor news. Your data is securely isolated to your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
            <Newspaper className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            News Monitoring
          </h1>
        </div>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-4">
          Real-time tracking of your contacts in entertainment trade publications
        </p>
        
        <div className="flex items-center justify-center space-x-6 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>{legacyContacts.length} contacts monitored</span>
          </div>
          <div className="flex items-center space-x-2">
            <Newspaper className="h-4 w-4" />
            <span>{storedMatches.length} total matches</span>
          </div>
          <div className="flex items-center space-x-2">
            <Bell className="h-4 w-4" />
            <span>{storedMatches.filter(m => !m.isRead).length} unread</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>🟢</span>
            <span className="text-green-600 dark:text-green-400">
              Realtime: active
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span>👤</span>
            <span className="text-blue-600 dark:text-blue-400">
              User: {user.email}
            </span>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Real-Time Monitoring Status
          </h3>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900 rounded text-xs text-green-700 dark:text-green-300">
              WordPress API + Realtime DB
            </span>
            <div className="px-2 py-1 rounded text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              🟢 connected
            </div>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-xs text-blue-700 dark:text-blue-300">
              User-Isolated
            </span>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Auto-Check Status */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-check
              </span>
              <button
                onClick={handleToggleAutoCheck}
                className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  autoCheckEnabled
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {autoCheckEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                <span>{autoCheckEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>
            
            {autoCheckEnabled && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Next check: {timeUntilNext || 'Calculating...'}
              </div>
            )}
          </div>

          {/* Last Check */}
          <div className="space-y-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Last checked
            </span>
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>
                {lastCheck ? formatTimeAgo(lastCheck) : 'Never'}
              </span>
            </div>
          </div>

          {/* Manual Check */}
          <div className="space-y-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Manual check
            </span>
            <button
              onClick={handleCheckNow}
              disabled={isChecking || legacyContacts.length === 0 || contactsLoading || !user}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>Check Now</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">
              Settings
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Check Interval
                </label>
                <select
                  value={useNewsStore.getState().autoCheckInterval}
                  onChange={(e) => {
                    console.log('Interval change:', e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value={15 * 60 * 1000}>15 minutes</option>
                  <option value={30 * 60 * 1000}>30 minutes</option>
                  <option value={60 * 60 * 1000}>1 hour</option>
                  <option value={2 * 60 * 60 * 1000}>2 hours</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notifications
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={'Notification' in window && Notification.permission === 'granted'}
                    onChange={() => {
                      if ('Notification' in window) {
                        Notification.requestPermission();
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Browser notifications
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Real-Time Processing Status */}
      {isChecking && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300">
              Real-Time News Processing for {user.email}
            </h3>
          </div>
          
          <div className="space-y-3">
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p>✅ Backend processing initiated for user {user.email}</p>
              <p>🔄 Scanning WordPress APIs for Deadline, Variety, and THR</p>
              <p>📡 New matches will appear instantly via Realtime updates</p>
              <p className="text-green-600 dark:text-green-400">
                🟢 Realtime connection: active
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No Contacts Warning */}
      {legacyContacts.length === 0 && !contactsLoading && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-8 text-center">
          <AlertCircle className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
            No Contacts to Monitor
          </h3>
          <p className="text-yellow-700 dark:text-yellow-400 mb-4">
            Import your contacts first to start monitoring news mentions.
          </p>
          <a
            href="/import"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <span>Import Contacts</span>
          </a>
        </div>
      )}

      {/* Filters and Actions */}
      {storedMatches.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Publication
                </label>
                <select
                  value={selectedPublication}
                  onChange={(e) => setSelectedPublication(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Publications</option>
                  <option value="deadline">Deadline ({publicationStats.deadline})</option>
                  <option value="variety">Variety ({publicationStats.variety})</option>
                  <option value="thr">The Hollywood Reporter ({publicationStats.thr})</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  View
                </label>
                <button
                  onClick={() => setShowAllMatches(!showAllMatches)}
                  className="flex items-center space-x-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {showAllMatches ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  <span>{showAllMatches ? 'All Matches' : 'Unread Only'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {storedMatches.filter(m => !m.isRead).length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Mark All Read</span>
                </button>
              )}
              
              <button
                onClick={() => {
                  if (window.confirm('Clear all matches? This cannot be undone.')) {
                    clearMatches();
                  }
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Matches List */}
      {sortedMatches.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Your Contacts in the News ({sortedMatches.length})
          </h2>
          
          {sortedMatches.map((match) => {
            const quality = getMatchQuality(match);
            
            return (
              <div
                key={match.id}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-200 hover:shadow-xl ${
                  !match.isRead ? 'ring-2 ring-blue-500 ring-opacity-20' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {match.contactName}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        match.contactCategory === 'ACTOR' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        match.contactCategory === 'DIRECTOR' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                        match.contactCategory === 'PRODUCER' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        match.contactCategory === 'AGENT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                        match.contactCategory === 'EXECUTIVE' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        match.contactCategory === 'WRITER' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {match.contactCategory.charAt(0) + match.contactCategory.slice(1).toLowerCase()}
                      </span>
                      {!match.isRead && (
                        <span className="px-2 py-1 bg-blue-500 text-white text-xs font-bold rounded-full">
                          NEW
                        </span>
                      )}
                    </div>
                    
                    <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      {match.articleTitle}
                    </h4>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                      <span className="font-medium">
                        {getPublicationName(match.publication)}
                      </span>
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatTimeAgo(match.foundAt)}</span>
                      </span>
                      <span className="flex items-center space-x-1" title={quality.description}>
                        <span>{quality.icon}</span>
                        <span>{quality.label}</span>
                      </span>
                    </div>
                    
                    {match.excerpt && (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                          {match.excerpt}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleMarkAsRead(match.id)}
                      disabled={match.isRead}
                      className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors disabled:opacity-50"
                      title={match.isRead ? 'Already read' : 'Mark as read'}
                    >
                      <CheckCircle className="h-5 w-5" />
                    </button>
                    
                    <button
                      onClick={() => handleRemoveMatch(match.id)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Remove match"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {/* IMPROVED: Read Article button with NO onClick handler */}
                  <a
                    href={match.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Read Article</span>
                  </a>
                  
                  <button
                    onClick={() => handleEmailContact(match)}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Email Contact</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : storedMatches.length > 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
          <Eye className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No matches for current filter
          </h3>
          <p className="text-gray-600 dark:text-gray-300">
            Try changing your publication filter or viewing all matches.
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
          <Newspaper className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No news matches yet
          </h3>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            We haven't found any mentions of your contacts in recent entertainment news.
          </p>
          {legacyContacts.length > 0 && !contactsLoading && (
            <button
              onClick={handleCheckNow}
              disabled={isChecking || !user}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>Check for News</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Email Draft Modal */}
      {draftingMatch && (
        <EmailDraftModal
          match={draftingMatch}
          onClose={() => setDraftingMatch(null)}
        />
      )}
    </div>
  );
}