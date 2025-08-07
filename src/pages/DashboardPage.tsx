import { Film, Users, Upload, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to Keep in Touch
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Manage your entertainment industry relationships with ease. Import contacts, 
          track connections, and never lose touch with your professional network.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Please connect your contacts
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="relative">
            <button className="w-full p-6 border-2 border-gray-300 dark:border-gray-600 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200 cursor-not-allowed opacity-50">
              <div className="flex flex-col items-center space-y-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                  <svg className="h-8 w-8 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">Outlook</span>
              </div>
            </button>
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-xl">
              <span className="text-white font-medium">Coming Soon</span>
            </div>
          </div>

          <div className="relative">
            <button className="w-full p-6 border-2 border-gray-300 dark:border-gray-600 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200 cursor-not-allowed opacity-50">
              <div className="flex flex-col items-center space-y-3">
                <div className="p-3 bg-red-100 dark:bg-red-900 rounded-full">
                  <svg className="h-8 w-8 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">Gmail</span>
              </div>
            </button>
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-xl">
              <span className="text-white font-medium">Coming Soon</span>
            </div>
          </div>

          <div className="relative">
            <button className="w-full p-6 border-2 border-gray-300 dark:border-gray-600 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-200 cursor-not-allowed opacity-50">
              <div className="flex flex-col items-center space-y-3">
                <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-full">
                  <svg className="h-8 w-8 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </div>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">Yahoo</span>
              </div>
            </button>
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-xl">
              <span className="text-white font-medium">Coming Soon</span>
            </div>
          </div>

          <Link to="/import" className="w-full p-6 border-2 border-blue-500 dark:border-blue-400 rounded-xl hover:border-blue-600 dark:hover:border-blue-300 transition-all duration-200 hover:shadow-lg">
            <div className="flex flex-col items-center space-y-3">
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
                <FileText className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">CSV</span>
            </div>
          </Link>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            For now, please export your contacts as CSV and upload them here.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Other integrations coming soon - Outlook, Gmail, and Yahoo support in development.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="/contacts" className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">View Contacts</h3>
              <p className="text-gray-600 dark:text-gray-300">Browse and manage your network</p>
            </div>
          </div>
        </Link>

        <Link to="/import" className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-full">
              <Upload className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Import Contacts</h3>
              <p className="text-gray-600 dark:text-gray-300">Upload CSV files to add contacts</p>
            </div>
          </div>
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-full">
              <Film className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">TMDB Integration</h3>
              <p className="text-gray-600 dark:text-gray-300">Coming soon - track industry credits</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}