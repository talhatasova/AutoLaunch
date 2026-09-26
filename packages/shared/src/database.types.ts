// Schema types synchronized with the checked-in Supabase migrations.
// Regenerate with `supabase gen types typescript --project-id <project-id>` when available.
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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      apps: {
        Row: {
          category: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          scraped_at: string | null
          screenshot_url: string | null
          status: Database["public"]["Enums"]["app_status"]
          tagline: string | null
          url: string
          user_id: string
        }
        Insert: {
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          scraped_at?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["app_status"]
          tagline?: string | null
          url: string
          user_id: string
        }
        Update: {
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          scraped_at?: string | null
          screenshot_url?: string | null
          status?: Database["public"]["Enums"]["app_status"]
          tagline?: string | null
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      directories: {
        Row: {
          api_config: Json | null
          automation_check_note: string | null
          automation_checked_at: string | null
          automation_verified_at: string | null
          category: string
          created_at: string
          domain_rating: number | null
          evidence: Json
          form_schema: Json | null
          id: string
          last_verified_at: string | null
          name: string
          obligation: string | null
          price_checked_at: string | null
          price_kind: string
          price_note: string | null
          price_source_url: string | null
          requires_captcha: boolean
          requires_consent: boolean
          requires_profile_fields: string[]
          receipt_verified: boolean
          rules_permit_automation: boolean
          slug: string
          status: Database["public"]["Enums"]["directory_status"]
          submission_method: Database["public"]["Enums"]["submission_method"]
          submission_url: string
          terms_url: string | null
          tier: number
          url: string
        }
        Insert: {
          api_config?: Json | null
          automation_check_note?: string | null
          automation_checked_at?: string | null
          automation_verified_at?: string | null
          category: string
          created_at?: string
          domain_rating?: number | null
          evidence: Json
          form_schema?: Json | null
          id?: string
          last_verified_at?: string | null
          name: string
          obligation?: string | null
          price_checked_at?: string | null
          price_kind?: string
          price_note?: string | null
          price_source_url?: string | null
          requires_captcha?: boolean
          requires_consent?: boolean
          requires_profile_fields?: string[]
          receipt_verified?: boolean
          rules_permit_automation?: boolean
          slug: string
          status?: Database["public"]["Enums"]["directory_status"]
          submission_method: Database["public"]["Enums"]["submission_method"]
          submission_url: string
          terms_url?: string | null
          tier: number
          url: string
        }
        Update: {
          api_config?: Json | null
          automation_check_note?: string | null
          automation_checked_at?: string | null
          automation_verified_at?: string | null
          category?: string
          created_at?: string
          domain_rating?: number | null
          evidence?: Json
          form_schema?: Json | null
          id?: string
          last_verified_at?: string | null
          name?: string
          obligation?: string | null
          price_checked_at?: string | null
          price_kind?: string
          price_note?: string | null
          price_source_url?: string | null
          requires_captcha?: boolean
          requires_consent?: boolean
          requires_profile_fields?: string[]
          receipt_verified?: boolean
          rules_permit_automation?: boolean
          slug?: string
          status?: Database["public"]["Enums"]["directory_status"]
          submission_method?: Database["public"]["Enums"]["submission_method"]
          submission_url?: string
          terms_url?: string | null
          tier?: number
          url?: string
        }
        Relationships: []
      }
      submission_events: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["submission_event_kind"]
          message: string
          payload: Json | null
          submission_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["submission_event_kind"]
          message?: string
          payload?: Json | null
          submission_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["submission_event_kind"]
          message?: string
          payload?: Json | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          app_id: string
          approved_at: string | null
          approved_payload: Json | null
          attempt_count: number
          consent_granted_at: string | null
          created_at: string
          directory_id: string
          error_message: string | null
          id: string
          live_checked_at: string | null
          next_attempt_at: string | null
          obligation_confirmed_at: string | null
          receipt_evidence: Json | null
          result_url: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string | null
        }
        Insert: {
          app_id: string
          approved_at?: string | null
          approved_payload?: Json | null
          attempt_count?: number
          consent_granted_at?: string | null
          created_at?: string
          directory_id: string
          error_message?: string | null
          id?: string
          live_checked_at?: string | null
          next_attempt_at?: string | null
          obligation_confirmed_at?: string | null
          receipt_evidence?: Json | null
          result_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
        }
        Update: {
          app_id?: string
          approved_at?: string | null
          approved_payload?: Json | null
          attempt_count?: number
          consent_granted_at?: string | null
          created_at?: string
          directory_id?: string
          error_message?: string | null
          id?: string
          live_checked_at?: string | null
          next_attempt_at?: string | null
          obligation_confirmed_at?: string | null
          receipt_evidence?: Json | null
          result_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "directories"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_jobs: {
        Row: {
          available_at: string
          claimed_at: string | null
          created_at: string
          finished_at: string | null
          id: string
          submission_id: string
        }
        Insert: {
          available_at?: string
          claimed_at?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          submission_id: string
        }
        Update: {
          available_at?: string
          claimed_at?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_jobs_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_targets: {
        Args: { p_app_id: string; p_targets: Json; p_reviewed_contact_email: string }
        Returns: Database["public"]["Tables"]["submissions"]["Row"][]
      }
      claim_submission_job: {
        Args: Record<PropertyKey, never>
        Returns: { job_id: string; submission_id: string; app_id: string; directory_id: string }[]
      }
      confirm_live_listing: {
        Args: { p_submission_id: string; p_owner_id: string; p_url: string; p_checked_at: string }
        Returns: Database["public"]["Tables"]["submissions"]["Row"]
      }
      retry_failed_submission: {
        Args: { p_submission_id: string }
        Returns: Database["public"]["Tables"]["submissions"]["Row"]
      }
    }
    Enums: {
      app_status: "draft" | "ready" | "launching" | "done" | "submitted"
      directory_status: "active" | "broken"
      submission_event_kind:
        | "queued"
        | "started"
        | "field_filled"
        | "submitted"
        | "succeeded"
        | "challenge_detected"
        | "manual_required"
        | "selector_missing"
        | "retry_scheduled"
        | "failed"
        | "receipt"
        | "unconfirmed"
        | "live"
      submission_method: "api" | "form" | "manual"
      submission_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "needs_manual"
        | "pending_review"
        | "unconfirmed"
        | "live"
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
      app_status: ["draft", "ready", "launching", "done", "submitted"],
      directory_status: ["active", "broken"],
      submission_event_kind: [
        "queued",
        "started",
        "field_filled",
        "submitted",
        "succeeded",
        "challenge_detected",
        "manual_required",
        "selector_missing",
        "retry_scheduled",
        "failed",
        "receipt",
        "unconfirmed",
        "live",
      ],
      submission_method: ["api", "form", "manual"],
      submission_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "needs_manual",
        "pending_review",
        "unconfirmed",
        "live",
      ],
    },
  },
} as const
