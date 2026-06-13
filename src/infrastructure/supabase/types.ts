export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bundle_patches: {
        Row: {
          base_bundle_id: string
          base_file_hash: string
          bundle_id: string
          id: string
          order_index: number
          patch_file_hash: string
          patch_storage_uri: string
        }
        Insert: {
          base_bundle_id: string
          base_file_hash: string
          bundle_id: string
          id: string
          order_index?: number
          patch_file_hash: string
          patch_storage_uri: string
        }
        Update: {
          base_bundle_id?: string
          base_file_hash?: string
          bundle_id?: string
          id?: string
          order_index?: number
          patch_file_hash?: string
          patch_storage_uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_patches_base_bundle_id_fkey"
            columns: ["base_bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_patches_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          asset_base_storage_uri: string | null
          channel: string
          enabled: boolean
          file_hash: string
          fingerprint_hash: string | null
          git_commit_hash: string | null
          id: string
          manifest_file_hash: string | null
          manifest_storage_uri: string | null
          message: string | null
          metadata: Json | null
          platform: Database["public"]["Enums"]["platforms"]
          rollout_cohort_count: number | null
          should_force_update: boolean
          storage_uri: string
          target_app_version: string | null
          target_cohorts: string[] | null
        }
        Insert: {
          asset_base_storage_uri?: string | null
          channel?: string
          enabled: boolean
          file_hash: string
          fingerprint_hash?: string | null
          git_commit_hash?: string | null
          id: string
          manifest_file_hash?: string | null
          manifest_storage_uri?: string | null
          message?: string | null
          metadata?: Json | null
          platform: Database["public"]["Enums"]["platforms"]
          rollout_cohort_count?: number | null
          should_force_update: boolean
          storage_uri: string
          target_app_version?: string | null
          target_cohorts?: string[] | null
        }
        Update: {
          asset_base_storage_uri?: string | null
          channel?: string
          enabled?: boolean
          file_hash?: string
          fingerprint_hash?: string | null
          git_commit_hash?: string | null
          id?: string
          manifest_file_hash?: string | null
          manifest_storage_uri?: string | null
          message?: string | null
          metadata?: Json | null
          platform?: Database["public"]["Enums"]["platforms"]
          rollout_cohort_count?: number | null
          should_force_update?: boolean
          storage_uri?: string
          target_app_version?: string | null
          target_cohorts?: string[] | null
        }
        Relationships: []
      }
      channel_invites: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          status: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          status?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_invites_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_post_emoji_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_post_emoji_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_post_emoji_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_posts: {
        Row: {
          channel_id: string
          created_at: string
          duration: number | null
          hidden: boolean
          id: string
          is_pinned: boolean
          message: string | null
          parent_post_id: string | null
          post_type: string
          poster_id: string
          recorded_with_headphones: boolean
          source_type: string
          storage_mode: string
          video_url: string | null
          yt_video_id: string | null
          yt_video_thumbnail: string | null
          yt_video_title: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          duration?: number | null
          hidden?: boolean
          id?: string
          is_pinned?: boolean
          message?: string | null
          parent_post_id?: string | null
          post_type?: string
          poster_id: string
          recorded_with_headphones?: boolean
          source_type?: string
          storage_mode?: string
          video_url?: string | null
          yt_video_id?: string | null
          yt_video_thumbnail?: string | null
          yt_video_title?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          duration?: number | null
          hidden?: boolean
          id?: string
          is_pinned?: boolean
          message?: string | null
          parent_post_id?: string | null
          post_type?: string
          poster_id?: string
          recorded_with_headphones?: boolean
          source_type?: string
          storage_mode?: string
          video_url?: string | null
          yt_video_id?: string | null
          yt_video_thumbnail?: string | null
          yt_video_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_posts_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reviews: {
        Row: {
          channel_id: string
          created_at: string
          duration: number | null
          id: string
          post_id: string
          reviewer_id: string
          storage_mode: string
          video_url: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          duration?: number | null
          id?: string
          post_id: string
          reviewer_id: string
          storage_mode?: string
          video_url?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          duration?: number | null
          id?: string
          post_id?: string
          reviewer_id?: string
          storage_mode?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_reviews_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reviews_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_subscription_tiers: {
        Row: {
          active: boolean
          channel_id: string
          created_at: string
          id: string
          idx: number
          price_cents: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_id: string
          created_at?: string
          id?: string
          idx: number
          price_cents: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_id?: string
          created_at?: string
          id?: string
          idx?: number
          price_cents?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_subscription_tiers_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_subscriptions: {
        Row: {
          channel_id: string
          created_at: string
          current_period_end: string | null
          fee_bps: number | null
          id: string
          status: string
          stripe_subscription_id: string | null
          tier_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          current_period_end?: string | null
          fee_bps?: number | null
          id?: string
          status?: string
          stripe_subscription_id?: string | null
          tier_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          current_period_end?: string | null
          fee_bps?: number | null
          id?: string
          status?: string
          stripe_subscription_id?: string | null
          tier_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_subscriptions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "channel_subscription_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_feed_items: {
        Row: {
          channel_title: string | null
          fetched_at: string
          id: string
          provider: string
          published_at: string | null
          source_type: string
          thumbnail: string | null
          title: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          channel_title?: string | null
          fetched_at?: string
          id?: string
          provider: string
          published_at?: string | null
          source_type?: string
          thumbnail?: string | null
          title?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          channel_title?: string | null
          fetched_at?: string
          id?: string
          provider?: string
          published_at?: string | null
          source_type?: string
          thumbnail?: string | null
          title?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_feed_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string | null
        }
        Relationships: []
      }
      creator_billing: {
        Row: {
          stripe_connect_account_id: string | null
          stripe_customer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_billing_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_usage: {
        Row: {
          creator_id: string
          month: string
          reactions_count: number
          reviews_count: number
        }
        Insert: {
          creator_id: string
          month: string
          reactions_count?: number
          reviews_count?: number
        }
        Update: {
          creator_id?: string
          month?: string
          reactions_count?: number
          reviews_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_usage_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      early_access_signups: {
        Row: {
          created_at: string
          email: string
          handle: string | null
          id: string
          referral: string | null
        }
        Insert: {
          created_at?: string
          email: string
          handle?: string | null
          id?: string
          referral?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          handle?: string | null
          id?: string
          referral?: string | null
        }
        Relationships: []
      }
      emoji_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          reaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          reaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          reaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emoji_reactions_reaction_id_fkey"
            columns: ["reaction_id"]
            isOneToOne: false
            referencedRelation: "reactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emoji_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          status: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          invite_only: boolean
          is_curated: boolean
          is_hidden: boolean
          is_members_only: boolean
          is_public: boolean
          member_count: number
          name: string
          pinned_video_id: string | null
          pinned_video_thumbnail: string | null
          pinned_video_title: string | null
          reviews_allowed: boolean
          reviews_enabled: boolean
          subscriber_mode: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          invite_only?: boolean
          is_curated?: boolean
          is_hidden?: boolean
          is_members_only?: boolean
          is_public?: boolean
          member_count?: number
          name: string
          pinned_video_id?: string | null
          pinned_video_thumbnail?: string | null
          pinned_video_title?: string | null
          reviews_allowed?: boolean
          reviews_enabled?: boolean
          subscriber_mode?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          invite_only?: boolean
          is_curated?: boolean
          is_hidden?: boolean
          is_members_only?: boolean
          is_public?: boolean
          member_count?: number
          name?: string
          pinned_video_id?: string | null
          pinned_video_thumbnail?: string | null
          pinned_video_title?: string | null
          reviews_allowed?: boolean
          reviews_enabled?: boolean
          subscriber_mode?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_by: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_by: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_by?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          allowed: boolean
          content_type: string | null
          created_at: string
          frame_count: number | null
          id: string
          scores: Json
          tripped_categories: string[]
          user_id: string | null
        }
        Insert: {
          allowed: boolean
          content_type?: string | null
          created_at?: string
          frame_count?: number | null
          id?: string
          scores?: Json
          tripped_categories?: string[]
          user_id?: string | null
        }
        Update: {
          allowed?: boolean
          content_type?: string | null
          created_at?: string
          frame_count?: number | null
          id?: string
          scores?: Json
          tripped_categories?: string[]
          user_id?: string | null
        }
        Relationships: []
      }
      reaction_downloads: {
        Row: {
          downloaded_at: string
          reaction_id: string
          user_id: string
        }
        Insert: {
          downloaded_at?: string
          reaction_id: string
          user_id: string
        }
        Update: {
          downloaded_at?: string
          reaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reaction_downloads_reaction_id_fkey"
            columns: ["reaction_id"]
            isOneToOne: false
            referencedRelation: "reactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reactions: {
        Row: {
          created_at: string
          duration: number
          id: string
          recorded_with_headphones: boolean
          source_type: string
          storage_mode: string
          thread_id: string
          user_id: string
          video_url: string | null
          yt_start_offset: number | null
          yt_video_id: string | null
        }
        Insert: {
          created_at?: string
          duration?: number
          id?: string
          recorded_with_headphones?: boolean
          source_type?: string
          storage_mode?: string
          thread_id: string
          user_id: string
          video_url?: string | null
          yt_start_offset?: number | null
          yt_video_id?: string | null
        }
        Update: {
          created_at?: string
          duration?: number
          id?: string
          recorded_with_headphones?: boolean
          source_type?: string
          storage_mode?: string
          thread_id?: string
          user_id?: string
          video_url?: string | null
          yt_start_offset?: number | null
          yt_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reactions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recommended_items: {
        Row: {
          channel_id: string | null
          channel_title: string | null
          duration: number | null
          fetched_at: string
          id: string
          published_at: string | null
          source_type: string
          thumbnail: string | null
          title: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          channel_id?: string | null
          channel_title?: string | null
          duration?: number | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          source_type?: string
          thumbnail?: string | null
          title?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          channel_id?: string | null
          channel_title?: string | null
          duration?: number | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          source_type?: string
          thumbnail?: string | null
          title?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      shorts: {
        Row: {
          category: string
          channel: string | null
          channel_country: string | null
          channel_id: string | null
          duration: number
          fetched_at: string
          id: string
          published_at: string | null
          thumbnail: string
          title: string
          video_id: string
        }
        Insert: {
          category?: string
          channel?: string | null
          channel_country?: string | null
          channel_id?: string | null
          duration: number
          fetched_at?: string
          id?: string
          published_at?: string | null
          thumbnail: string
          title: string
          video_id: string
        }
        Update: {
          category?: string
          channel?: string | null
          channel_country?: string | null
          channel_id?: string | null
          duration?: number
          fetched_at?: string
          id?: string
          published_at?: string | null
          thumbnail?: string
          title?: string
          video_id?: string
        }
        Relationships: []
      }
      shorts_channels: {
        Row: {
          added_via: string | null
          category: string
          channel_id: string
          channel_title: string | null
          created_at: string
          enabled: boolean
          last_fetched_at: string | null
        }
        Insert: {
          added_via?: string | null
          category?: string
          channel_id: string
          channel_title?: string | null
          created_at?: string
          enabled?: boolean
          last_fetched_at?: string | null
        }
        Update: {
          added_via?: string | null
          category?: string
          channel_id?: string
          channel_title?: string | null
          created_at?: string
          enabled?: boolean
          last_fetched_at?: string | null
        }
        Relationships: []
      }
      synced_account_tokens: {
        Row: {
          access_token: string
          refresh_token: string | null
          scopes: string | null
          synced_account_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          refresh_token?: string | null
          scopes?: string | null
          synced_account_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          refresh_token?: string | null
          scopes?: string | null
          synced_account_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "synced_account_tokens_synced_account_id_fkey"
            columns: ["synced_account_id"]
            isOneToOne: true
            referencedRelation: "synced_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      synced_accounts: {
        Row: {
          connection_type: string
          created_at: string
          enabled: boolean
          id: string
          last_synced_at: string | null
          provider: string
          provider_account_id: string
          provider_avatar_url: string | null
          provider_display_name: string | null
          provider_handle: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          provider: string
          provider_account_id: string
          provider_avatar_url?: string | null
          provider_display_name?: string | null
          provider_handle?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_synced_at?: string | null
          provider?: string
          provider_account_id?: string
          provider_avatar_url?: string | null
          provider_display_name?: string | null
          provider_handle?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "synced_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_members: {
        Row: {
          status: string
          thread_id: string
          user_id: string
        }
        Insert: {
          status?: string
          thread_id: string
          user_id: string
        }
        Update: {
          status?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          intro_duration: number | null
          intro_url: string | null
          sender_id: string
          source_type: string
          video_id: string
          video_thumbnail: string | null
          video_title: string | null
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          intro_duration?: number | null
          intro_url?: string | null
          sender_id: string
          source_type?: string
          video_id: string
          video_thumbnail?: string | null
          video_title?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          intro_duration?: number | null
          intro_url?: string | null
          sender_id?: string
          source_type?: string
          video_id?: string
          video_thumbnail?: string | null
          video_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          bio: string | null
          connect_onboarded: boolean
          created_at: string
          creator_plan: string
          creator_plan_status: string | null
          display_name: string
          handle: string
          id: string
          invite_code_used: string | null
          is_creator: boolean
          location: string | null
          phone: string | null
          plan_period_end: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          connect_onboarded?: boolean
          created_at?: string
          creator_plan?: string
          creator_plan_status?: string | null
          display_name: string
          handle: string
          id: string
          invite_code_used?: string | null
          is_creator?: boolean
          location?: string | null
          phone?: string | null
          plan_period_end?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          connect_onboarded?: boolean
          created_at?: string
          creator_plan?: string
          creator_plan_status?: string | null
          display_name?: string
          handle?: string
          id?: string
          invite_code_used?: string | null
          is_creator?: boolean
          location?: string | null
          phone?: string | null
          plan_period_end?: string | null
        }
        Relationships: []
      }
      video_comment_emoji_reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_comment_emoji_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "video_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_comment_emoji_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      video_comments: {
        Row: {
          author_id: string
          created_at: string
          duration: number | null
          emoji_count: number
          id: string
          parent_comment_id: string | null
          reply_count: number
          root_source_id: string
          source_type: string
          storage_mode: string
          video_url: string | null
        }
        Insert: {
          author_id: string
          created_at?: string
          duration?: number | null
          emoji_count?: number
          id?: string
          parent_comment_id?: string | null
          reply_count?: number
          root_source_id: string
          source_type: string
          storage_mode?: string
          video_url?: string | null
        }
        Update: {
          author_id?: string
          created_at?: string
          duration?: number | null
          emoji_count?: number
          id?: string
          parent_comment_id?: string | null
          reply_count?: number
          root_source_id?: string
          source_type?: string
          storage_mode?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "video_comments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_channel_invite: {
        Args: { p_channel_id: string }
        Returns: undefined
      }
      add_member_to_channel: {
        Args: { channel_id: string; new_user_id: string }
        Returns: undefined
      }
      decline_channel_invite: {
        Args: { p_channel_id: string }
        Returns: undefined
      }
      ensure_private_channel: {
        Args: { user_a: string; user_b: string }
        Returns: string
      }
      fetch_friends_trending: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          channel_title: string
          duration: number
          friend_count: number
          last_at: string
          score: number
          source_type: string
          thumbnail: string
          title: string
          video_id: string
        }[]
      }
      fetch_personalized_shorts: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          category: string
          channel_title: string
          duration: number
          fetched_at: string
          score: number
          thumbnail: string
          title: string
          video_id: string
        }[]
      }
      gcd_int: { Args: { a: number; b: number }; Returns: number }
      get_channel_members: {
        Args: { p_channel_id: string }
        Returns: {
          handle: string
          user_id: string
        }[]
      }
      get_channels: {
        Args: never
        Returns: {
          channel: string
        }[]
      }
      get_modular_inverse: {
        Args: { modulus: number; value: number }
        Returns: number
      }
      get_numeric_cohort_rollout_position: {
        Args: { bundle_id: string; cohort: string }
        Returns: number
      }
      get_private_channels_with_unread: {
        Args: { p_user_id: string }
        Returns: {
          channel_id: string
          last_message_at: string
          unread_count: number
        }[]
      }
      get_rollout_multiplier: { Args: { bundle_id: string }; Returns: number }
      get_rollout_offset: { Args: { bundle_id: string }; Returns: number }
      get_target_app_version_list: {
        Args: {
          app_platform: Database["public"]["Enums"]["platforms"]
          min_bundle_id: string
        }
        Returns: {
          target_app_version: string
        }[]
      }
      get_thread_recipients: {
        Args: { p_sender_id: string; p_video_id: string }
        Returns: string[]
      }
      get_update_info_by_app_version: {
        Args: {
          app_platform: Database["public"]["Enums"]["platforms"]
          app_version: string
          bundle_id: string
          cohort?: string
          min_bundle_id: string
          target_app_version_list: string[]
          target_channel: string
        }
        Returns: {
          file_hash: string
          id: string
          message: string
          should_force_update: boolean
          status: string
          storage_uri: string
        }[]
      }
      get_update_info_by_fingerprint_hash: {
        Args: {
          app_platform: Database["public"]["Enums"]["platforms"]
          bundle_id: string
          cohort?: string
          min_bundle_id: string
          target_channel: string
          target_fingerprint_hash: string
        }
        Returns: {
          file_hash: string
          id: string
          message: string
          should_force_update: boolean
          status: string
          storage_uri: string
        }[]
      }
      get_video_comments: {
        Args: {
          p_after_emoji?: number
          p_after_id?: string
          p_after_ts?: string
          p_limit?: number
          p_parent_comment_id?: string
          p_root_source_id: string
          p_source_type: string
          p_viewer_id?: string
        }
        Returns: {
          author_avatar_url: string
          author_handle: string
          author_id: string
          created_at: string
          duration: number
          emoji_count: number
          id: string
          is_friend: boolean
          parent_comment_id: string
          reply_count: number
          root_source_id: string
          source_type: string
          video_url: string
        }[]
      }
      has_active_channel_sub: {
        Args: { p_channel_id: string; uid: string }
        Returns: boolean
      }
      hash_rollout_value: { Args: { input: string }; Returns: number }
      invite_to_channel: {
        Args: { p_channel_id: string; p_user_id: string }
        Returns: undefined
      }
      is_channel_member: {
        Args: { channel_id: string; check_user_id: string }
        Returns: boolean
      }
      is_cohort_eligible: {
        Args: {
          bundle_id: string
          cohort: string
          rollout_cohort_count: number
          target_cohorts: string[]
        }
        Returns: boolean
      }
      is_members_only_channel: {
        Args: { channel_id: string }
        Returns: boolean
      }
      is_numeric_cohort: { Args: { cohort: string }; Returns: boolean }
      is_public_channel: { Args: { channel_id: string }; Returns: boolean }
      normalize_cohort_value: { Args: { cohort: string }; Returns: string }
      pick_channels_to_ingest: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          channel_id: string
          channel_title: string
        }[]
      }
      platform_fee_bps: { Args: { plan: string }; Returns: number }
      positive_mod: {
        Args: { modulus: number; value: number }
        Returns: number
      }
      reactions_to_expire: {
        Args: { ttl_days?: number }
        Returns: {
          id: string
          video_url: string
        }[]
      }
      reconcile_members_only_for: { Args: { uid: string }; Returns: undefined }
      send_push_to_user: {
        Args: {
          p_body: string
          p_thread_id?: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      platforms: "ios" | "android"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      platforms: ["ios", "android"],
    },
  },
} as const
