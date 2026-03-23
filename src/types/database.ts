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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent_type: string
          completed_at: string | null
          cost_est: number | null
          id: string
          input_summary: string | null
          model: string | null
          output_summary: string | null
          started_at: string | null
          status: string
          tokens_used: number | null
          trigger: string
        }
        Insert: {
          agent_type: string
          completed_at?: string | null
          cost_est?: number | null
          id?: string
          input_summary?: string | null
          model?: string | null
          output_summary?: string | null
          started_at?: string | null
          status?: string
          tokens_used?: number | null
          trigger: string
        }
        Update: {
          agent_type?: string
          completed_at?: string | null
          cost_est?: number | null
          id?: string
          input_summary?: string | null
          model?: string | null
          output_summary?: string | null
          started_at?: string | null
          status?: string
          tokens_used?: number | null
          trigger?: string
        }
        Relationships: []
      }
      contact_links: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          pipeline_id: string | null
          property_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          pipeline_id?: string | null
          property_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          pipeline_id?: string | null
          property_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_links_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          contact_id: string | null
          doc_type: string | null
          file_name: string
          file_path: string
          id: string
          pipeline_id: string | null
          property_id: string | null
          uploaded_at: string | null
        }
        Insert: {
          contact_id?: string | null
          doc_type?: string | null
          file_name: string
          file_path: string
          id?: string
          pipeline_id?: string | null
          property_id?: string | null
          uploaded_at?: string | null
        }
        Update: {
          contact_id?: string | null
          doc_type?: string | null
          file_name?: string
          file_path?: string
          id?: string
          pipeline_id?: string | null
          property_id?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      market_data: {
        Row: {
          data: Json
          data_type: string
          expires_at: string
          fetched_at: string | null
          id: string
          region: string
          region_type: string
        }
        Insert: {
          data: Json
          data_type: string
          expires_at: string
          fetched_at?: string | null
          id?: string
          region: string
          region_type: string
        }
        Update: {
          data?: Json
          data_type?: string
          expires_at?: string
          fetched_at?: string | null
          id?: string
          region?: string
          region_type?: string
        }
        Relationships: []
      }
      pipeline: {
        Row: {
          actual_renovation_cost: number | null
          created_at: string | null
          entered_stage_at: string | null
          id: string
          outcome: string | null
          property_id: string
          purchase_price: number | null
          sale_price: number | null
          stage: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actual_renovation_cost?: number | null
          created_at?: string | null
          entered_stage_at?: string | null
          id?: string
          outcome?: string | null
          property_id: string
          purchase_price?: number | null
          sale_price?: number | null
          stage?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          actual_renovation_cost?: number | null
          created_at?: string | null
          entered_stage_at?: string | null
          id?: string
          outcome?: string | null
          property_id?: string
          purchase_price?: number | null
          sale_price?: number | null
          stage?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          bathrooms: number | null
          bedrooms: number | null
          city: string
          county: string | null
          created_at: string | null
          estimated_value: number | null
          id: string
          lat: number | null
          list_price: number | null
          lng: number | null
          lot_size: number | null
          property_type: string | null
          raw_data: Json | null
          source: string | null
          sqft: number | null
          state: string
          updated_at: string | null
          year_built: number | null
          zip: string
        }
        Insert: {
          address: string
          bathrooms?: number | null
          bedrooms?: number | null
          city: string
          county?: string | null
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          lat?: number | null
          list_price?: number | null
          lng?: number | null
          lot_size?: number | null
          property_type?: string | null
          raw_data?: Json | null
          source?: string | null
          sqft?: number | null
          state: string
          updated_at?: string | null
          year_built?: number | null
          zip: string
        }
        Update: {
          address?: string
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string
          county?: string | null
          created_at?: string | null
          estimated_value?: number | null
          id?: string
          lat?: number | null
          list_price?: number | null
          lng?: number | null
          lot_size?: number | null
          property_type?: string | null
          raw_data?: Json | null
          source?: string | null
          sqft?: number | null
          state?: string
          updated_at?: string | null
          year_built?: number | null
          zip?: string
        }
        Relationships: []
      }
      property_analyses: {
        Row: {
          agent_model: string | null
          analysis_summary: string | null
          analyzed_at: string | null
          confidence_score: number | null
          flip_arv: number | null
          flip_carrying_costs: number | null
          flip_profit_margin: number | null
          flip_renovation_est: number | null
          flip_roi: number | null
          flip_timeline: string | null
          flip_total_investment: number | null
          id: string
          neighborhood_data: Json | null
          property_id: string
          recommended_strategy: string | null
          rental_annual_noi: number | null
          rental_cap_rate: number | null
          rental_cash_on_cash: number | null
          rental_monthly_cash_flow: number | null
          rental_monthly_est: number | null
          rental_monthly_expenses: number | null
        }
        Insert: {
          agent_model?: string | null
          analysis_summary?: string | null
          analyzed_at?: string | null
          confidence_score?: number | null
          flip_arv?: number | null
          flip_carrying_costs?: number | null
          flip_profit_margin?: number | null
          flip_renovation_est?: number | null
          flip_roi?: number | null
          flip_timeline?: string | null
          flip_total_investment?: number | null
          id?: string
          neighborhood_data?: Json | null
          property_id: string
          recommended_strategy?: string | null
          rental_annual_noi?: number | null
          rental_cap_rate?: number | null
          rental_cash_on_cash?: number | null
          rental_monthly_cash_flow?: number | null
          rental_monthly_est?: number | null
          rental_monthly_expenses?: number | null
        }
        Update: {
          agent_model?: string | null
          analysis_summary?: string | null
          analyzed_at?: string | null
          confidence_score?: number | null
          flip_arv?: number | null
          flip_carrying_costs?: number | null
          flip_profit_margin?: number | null
          flip_renovation_est?: number | null
          flip_roi?: number | null
          flip_timeline?: string | null
          flip_total_investment?: number | null
          id?: string
          neighborhood_data?: Json | null
          property_id?: string
          recommended_strategy?: string | null
          rental_annual_noi?: number | null
          rental_cap_rate?: number | null
          rental_cash_on_cash?: number | null
          rental_monthly_cash_flow?: number | null
          rental_monthly_est?: number | null
          rental_monthly_expenses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_analyses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_notes: {
        Row: {
          content: string
          created_at: string | null
          id: string
          property_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          property_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_notes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_predictions: {
        Row: {
          accuracy_score: number | null
          actual_value: number | null
          id: string
          metric: string
          predicted_at: string | null
          predicted_value: number
          property_id: string
          resolved_at: string | null
        }
        Insert: {
          accuracy_score?: number | null
          actual_value?: number | null
          id?: string
          metric: string
          predicted_at?: string | null
          predicted_value: number
          property_id: string
          resolved_at?: string | null
        }
        Update: {
          accuracy_score?: number | null
          actual_value?: number | null
          id?: string
          metric?: string
          predicted_at?: string | null
          predicted_value?: number
          property_id?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_predictions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
