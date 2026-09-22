export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          name: string
          notes: string | null
          opening_balance: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budget_categories: {
        Row: {
          budget_id: string
          category_id: string
          user_id: string
        }
        Insert: {
          budget_id: string
          category_id: string
          user_id: string
        }
        Update: {
          budget_id?: string
          category_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_budget_id_user_id_fkey"
            columns: ["budget_id", "user_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "budget_categories_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          created_at: string
          id: string
          name: string
          period: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          name: string
          period: string
          start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          name?: string
          period?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_same_user_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          date: string
          from_currency: string
          id: string
          rate: number
          to_currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          from_currency: string
          id?: string
          rate: number
          to_currency: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          from_currency?: string
          id?: string
          rate?: number
          to_currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_plans: {
        Row: {
          annual_return_rate: number
          created_at: string
          currency: string
          id: string
          initial_amount: number
          monthly_contribution: number
          name: string
          notes: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_return_rate?: number
          created_at?: string
          currency?: string
          id?: string
          initial_amount?: number
          monthly_contribution?: number
          name: string
          notes?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_return_rate?: number
          created_at?: string
          currency?: string
          id?: string
          initial_amount?: number
          monthly_contribution?: number
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_occurrences: {
        Row: {
          applied_at: string
          due_date: string
          id: string
          recurring_id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string
          due_date: string
          id?: string
          recurring_id: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string
          due_date?: string
          id?: string
          recurring_id?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_occurrences_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_occurrences_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          day_of_month: number | null
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          interval_value: number
          is_active: boolean
          next_date: string
          start_date: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string
          day_of_month?: number | null
          description?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          interval_value?: number
          is_active?: boolean
          next_date?: string
          start_date?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          day_of_month?: number | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          interval_value?: number
          is_active?: boolean
          next_date?: string
          start_date?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_account_currency_fkey"
            columns: ["account_id", "currency"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "currency"]
          },
          {
            foreignKeyName: "recurring_transactions_account_same_user_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_transactions_category_same_user_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          base_amount: number
          base_amount_stale: boolean
          base_currency: string
          category_id: string | null
          correlative_id: string | null
          created_at: string
          currency: string
          date: string
          description: string | null
          fx_date: string | null
          fx_rate: number | null
          id: string
          transfer_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          base_amount: number
          base_amount_stale?: boolean
          base_currency: string
          category_id?: string | null
          correlative_id?: string | null
          created_at?: string
          currency: string
          date: string
          description?: string | null
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          transfer_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          base_amount?: number
          base_amount_stale?: boolean
          base_currency?: string
          category_id?: string | null
          correlative_id?: string | null
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          fx_date?: string | null
          fx_rate?: number | null
          id?: string
          transfer_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_currency_fkey"
            columns: ["account_id", "currency"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "currency"]
          },
          {
            foreignKeyName: "transactions_account_same_user_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_category_same_user_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_ledger_effects: {
        Args: { p_account_id: string }
        Returns: number
      }
      apply_recurring_occurrence: {
        Args: {
          p_base_amount: number
          p_base_currency: string
          p_base_stale: boolean
          p_fx_date?: string
          p_fx_rate?: number
          p_recurring_id: string
        }
        Returns: number
      }
      assert_owned_account: {
        Args: { p_account_id: string; p_user_id: string }
        Returns: {
          balance: number
          created_at: string
          currency: string
          id: string
          name: string
          notes: string | null
          opening_balance: number
          type: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      budget_spending: {
        Args: { p_currency: string; p_today: string }
        Returns: {
          budget_amount: number
          budget_id: string
          budget_name: string
          budget_period: string
          spent: number
        }[]
      }
      convert_transfer_to_plain: {
        Args: {
          p_amount: number
          p_base_amount?: number
          p_base_currency?: string
          p_base_stale?: boolean
          p_category_id?: string
          p_date?: string
          p_description?: string
          p_fx_date?: string
          p_fx_rate?: number
          p_new_account_id: string
          p_new_type: string
          p_transaction_id: string
        }
        Returns: {
          account_id: string
          amount: number
          base_amount: number
          base_amount_stale: boolean
          base_currency: string
          category_id: string | null
          correlative_id: string | null
          created_at: string
          currency: string
          date: string
          description: string | null
          fx_date: string | null
          fx_rate: number | null
          id: string
          transfer_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_transfer: {
        Args: {
          p_amount: number
          p_category_id?: string
          p_converted_amount: number
          p_date?: string
          p_description?: string
          p_from_account_id: string
          p_idempotency_key: string
          p_in_base_amount?: number
          p_in_base_currency?: string
          p_in_base_stale?: boolean
          p_in_fx_date?: string
          p_in_fx_rate?: number
          p_out_base_amount?: number
          p_out_base_currency?: string
          p_out_base_stale?: boolean
          p_out_fx_date?: string
          p_out_fx_rate?: number
          p_out_transaction_id?: string
          p_to_account_id: string
        }
        Returns: {
          account_id: string
          amount: number
          base_amount: number
          base_amount_stale: boolean
          base_currency: string
          category_id: string | null
          correlative_id: string | null
          created_at: string
          currency: string
          date: string
          description: string | null
          fx_date: string | null
          fx_rate: number | null
          id: string
          transfer_id: string | null
          type: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      delete_transfer: { Args: { p_transfer_id: string }; Returns: undefined }
      edit_transfer: {
        Args: {
          p_amount: number
          p_category_id?: string
          p_converted_amount: number
          p_date?: string
          p_description?: string
          p_from_account_id: string
          p_in_base_amount?: number
          p_in_base_currency?: string
          p_in_base_stale?: boolean
          p_in_fx_date?: string
          p_in_fx_rate?: number
          p_out_base_amount?: number
          p_out_base_currency?: string
          p_out_base_stale?: boolean
          p_out_fx_date?: string
          p_out_fx_rate?: number
          p_to_account_id: string
          p_transfer_id: string
        }
        Returns: {
          account_id: string
          amount: number
          base_amount: number
          base_amount_stale: boolean
          base_currency: string
          category_id: string | null
          correlative_id: string | null
          created_at: string
          currency: string
          date: string
          description: string | null
          fx_date: string | null
          fx_rate: number | null
          id: string
          transfer_id: string | null
          type: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      recurring_next_date: {
        Args: {
          p_day_of_month?: number
          p_frequency: string
          p_interval_value: number
          p_next: string
        }
        Returns: string
      }
      replace_budget_categories: {
        Args: { p_budget_id: string; p_category_ids: string[] }
        Returns: undefined
      }
      report_by_category: {
        Args: { p_currency: string; p_from: string; p_to: string }
        Returns: {
          category_color: string
          category_icon: string
          category_id: string
          category_name: string
          expense: number
          income: number
        }[]
      }
      report_monthly: {
        Args: { p_currency: string; p_from: string; p_to: string }
        Returns: {
          expense: number
          income: number
          month_start: string
          unconverted: number
        }[]
      }
      report_summary: {
        Args: { p_currency: string; p_from: string; p_to: string }
        Returns: {
          expense: number
          income: number
          total: number
          unconverted: number
        }[]
      }
      restore_user_data: { Args: { p_payload: Json }; Returns: Json }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

