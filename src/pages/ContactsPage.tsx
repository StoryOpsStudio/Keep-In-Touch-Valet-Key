import { useState, useEffect } from 'react';
import { Search, Filter, Users, Mail, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { useContactStore } from '../store/contactStore';
import { useAuthStore } from '../store/authStore';

const CATEGORIES = ['ALL', 'ACTOR', 'DIRECTOR', 'PRODUCER', 'AGENT', 'EXECUTIVE', 'WRITER', 'OTHER'];

export function ContactsPage() {
  const { user } = useAuthStore();
  const { contacts, isLoading, error } = useContactStore();
  const { fetchContacts } = useContactStore();
  const [filteredContacts, setFilteredContacts] = useState<typeof contacts>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const limit = 12;

  // Fetch contacts when user is authenticated
  useEffect(() => {
    if (user) {
      fetchContacts();
    }
  }, [user, fetchContacts]);

  // Update filtered contacts when contacts or filters change
  useEffect(() => {
    filterContacts();
  }, [contacts, search, category, page]);

  const filterContacts = () => {
    let filtered = [...contacts];

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(contact => 
        contact.first_name.toLowerCase().includes(searchLower) ||
        contact.last_name.toLowerCase().includes(searchLower) ||
        (contact.email && contact.email.toLowerCase().includes(searchLower))
      );
    }

    // Apply category filter
    if (category !== 'ALL') {
      filtered = filtered.filter(contact => contact.category === category);
    }

    // Calculate pagination
    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedContacts = filtered.slice(startIndex, endIndex);

    setFilteredContacts(paginatedContacts);
    setTotal(totalFiltered);
    setPages(totalPages);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setPage(1);
  };

  const formatCategory = (cat: string) => {
    return cat.charAt(0) + cat.slice(1).toLowerCase();
  };

  if (isLoading && contacts.length === 0) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Loading Contacts</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            Fetching your contacts from Supabase database...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Contacts</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Manage your entertainment industry network
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
          <Users className="h-4 w-4" />
          <span>{total} contacts</span>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="font-medium text-red-900 dark:text-red-300">Database Error:</span>
            <span className="text-red-700 dark:text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={isLoading}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'All Categories' : formatCategory(cat)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Contacts Grid */}
      {filteredContacts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {search || category !== 'ALL' ? 'No contacts found' : 'No contacts yet'}
          </h3>
          <p className="text-gray-600 dark:text-gray-300">
            {search || category !== 'ALL' 
              ? 'Try adjusting your search or filter criteria.'
              : 'Start building your network by importing your first contacts.'
            }
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContacts.map((contact) => (
              <div key={contact.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {contact.first_name} {contact.last_name}
                    </h3>
                    {contact.email && (
                      <div className="flex items-center space-x-2 mt-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {contact.email}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        contact.category === 'ACTOR' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        contact.category === 'DIRECTOR' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                        contact.category === 'PRODUCER' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        contact.category === 'AGENT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                        contact.category === 'EXECUTIVE' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        contact.category === 'WRITER' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {formatCategory(contact.category || 'OTHER')}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Added {new Date(contact.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} contacts
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1 || isLoading}
                  className="flex items-center space-x-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>
                <span className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
                  Page {page} of {pages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === pages || isLoading}
                  className="flex items-center space-x-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}