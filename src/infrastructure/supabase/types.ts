export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          handle: string;
          display_name: string;
          avatar_url: string | null;
          invite_code_used: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      invite_codes: {
        Row: {
          code: string;
          created_by: string;
          used_by: string | null;
          used_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['invite_codes']['Row'], 'used_by' | 'used_at'>;
        Update: Partial<Database['public']['Tables']['invite_codes']['Row']>;
      };
      friendships: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          status: 'pending' | 'accepted';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['friendships']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['friendships']['Row']>;
      };
      groups: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['groups']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['groups']['Row']>;
      };
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
        };
        Insert: Database['public']['Tables']['group_members']['Row'];
        Update: Partial<Database['public']['Tables']['group_members']['Row']>;
      };
      threads: {
        Row: {
          id: string;
          video_id: string;
          video_title: string | null;
          video_thumbnail: string | null;
          sender_id: string;
          group_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['threads']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['threads']['Row']>;
      };
      thread_members: {
        Row: {
          thread_id: string;
          user_id: string;
          status: 'pending' | 'seen' | 'reacted';
        };
        Insert: Database['public']['Tables']['thread_members']['Row'];
        Update: Partial<Database['public']['Tables']['thread_members']['Row']>;
      };
      reactions: {
        Row: {
          id: string;
          thread_id: string;
          user_id: string;
          video_url: string;
          duration: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['reactions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['reactions']['Row']>;
      };
      emoji_reactions: {
        Row: {
          id: string;
          reaction_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['emoji_reactions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['emoji_reactions']['Row']>;
      };
    };
  };
}
