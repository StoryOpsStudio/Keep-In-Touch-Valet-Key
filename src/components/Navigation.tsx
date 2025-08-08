import { Link, useLocation } from 'react-router-dom';
import { Film, Users, Upload, Sparkles, Newspaper } from 'lucide-react';
import { useNewsStore } from '../store/newsStore';
import { UserMenu } from './UserMenu';

export function Navigation() {
  const location = useLocation();
  const { unreadCount } = useNewsStore();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Film },
    { name: 'Contacts', href: '/contacts', icon: Users },
    { name: 'Premieres', href: '/premieres', icon: Sparkles },
    { name: 'News', href: '/news', icon: Newspaper, badge: unreadCount },
    { name: 'Import', href: '/import', icon: Upload },
  ];

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <Film className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Keep in Touch
              </span>
            </Link>
            
            <div className="flex space-x-4">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                    {item.badge && item.badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center">
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}