// src/services/realtimeService.ts
import { supabase } from '../supabaseClient';
import { useNewsStore } from '../store/newsStore';
import { RealtimeChannel } from '@supabase/supabase-js';

let newsChannel: RealtimeChannel | null = null;

export const realtimeService = {
  subscribeToNewsMatches: () => {
    // First, always unsubscribe from any existing channel to be safe
    if (newsChannel) {
      realtimeService.unsubscribe();
    }
    
    console.log('📡 [RealtimeService] Subscribing to news-alerts channel...');
    
    newsChannel = supabase
      .channel('news-alerts')
      .on('broadcast', { event: 'new_match' }, ({ payload }) => {
        console.log('✅ [RealtimeService] New match received via Broadcast:', payload);
        
        // Transform broadcast payload to NewsMatch format
        const newsMatch = {
          id: payload.id || `${payload.articleUrl}-${payload.contactId}`,
          contactId: payload.contactId,
          contactName: payload.contactName,
          contactCategory: payload.contactCategory || 'OTHER',
          articleTitle: payload.articleTitle,
          articleUrl: payload.articleUrl,
          publication: payload.publication,
          matchLocation: payload.matchLocation,
          excerpt: payload.excerpt || '',
          foundAt: new Date(payload.foundAt),
          isNew: payload.isNew !== false, // Default to true
          isRead: payload.isRead || false,
          source: payload.source || 'wordpress-api'
        };
        
        // Add to global store - will appear instantly at top of list
        useNewsStore.getState().addMatch(newsMatch);
        
        // Show browser notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Keep in Touch - New Match Found!', {
            body: `${newsMatch.contactName} mentioned in "${newsMatch.articleTitle}"`,
            icon: '/favicon.ico'
          });
        }
      })
      .subscribe((status) => {
        console.log(`📢 [RealtimeService] News alerts channel status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ [RealtimeService] Successfully subscribed to news alerts');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [RealtimeService] Channel error occurred');
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ [RealtimeService] Connection timed out');
        } else if (status === 'CLOSED') {
          console.warn('⚠️ [RealtimeService] Connection closed');
        }
      });
  },

  unsubscribe: () => {
    if (newsChannel) {
      console.log('🔌 [RealtimeService] Unsubscribing from news-alerts channel.');
      supabase.removeChannel(newsChannel);
      newsChannel = null;
    }
  },
};