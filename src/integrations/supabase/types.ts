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
      branches: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      checklist_assignments: {
        Row: {
          assigned_to: string
          branch_id: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          last_generated_date: string | null
          notes: string | null
          periodicity: Database["public"]["Enums"]["assignment_periodicity"]
          start_date: string
          status: Database["public"]["Enums"]["assignment_status"]
          template_id: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          last_generated_date?: string | null
          notes?: string | null
          periodicity?: Database["public"]["Enums"]["assignment_periodicity"]
          start_date?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          template_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          last_generated_date?: string | null
          notes?: string | null
          periodicity?: Database["public"]["Enums"]["assignment_periodicity"]
          start_date?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_instances: {
        Row: {
          assigned_to: string | null
          assignment_id: string | null
          branch_id: string | null
          checklist_type: Database["public"]["Enums"]["checklist_type"]
          created_at: string
          department: Database["public"]["Enums"]["department"]
          id: string
          notes: string | null
          rejection_note: string | null
          scheduled_date: string
          status: Database["public"]["Enums"]["checklist_status"]
          submitted_at: string | null
          template_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          assignment_id?: string | null
          branch_id?: string | null
          checklist_type: Database["public"]["Enums"]["checklist_type"]
          created_at?: string
          department: Database["public"]["Enums"]["department"]
          id?: string
          notes?: string | null
          rejection_note?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          submitted_at?: string | null
          template_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          assignment_id?: string | null
          branch_id?: string | null
          checklist_type?: Database["public"]["Enums"]["checklist_type"]
          created_at?: string
          department?: Database["public"]["Enums"]["department"]
          id?: string
          notes?: string | null
          rejection_note?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          submitted_at?: string | null
          template_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_instances_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "checklist_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_instances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_task_completions: {
        Row: {
          comment: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          instance_id: string
          is_completed: boolean
          photo_url: string | null
          task_id: string
        }
        Insert: {
          comment?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          instance_id: string
          is_completed?: boolean
          photo_url?: string | null
          task_id: string
        }
        Update: {
          comment?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          instance_id?: string
          is_completed?: boolean
          photo_url?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_task_completions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "checklist_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_tasks: {
        Row: {
          created_at: string
          id: string
          photo_requirement: Database["public"]["Enums"]["photo_requirement"]
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_requirement?: Database["public"]["Enums"]["photo_requirement"]
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_requirement?: Database["public"]["Enums"]["photo_requirement"]
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          branch_id: string | null
          checklist_type: Database["public"]["Enums"]["checklist_type"]
          created_at: string
          created_by: string | null
          default_assigned_to: string | null
          department: Database["public"]["Enums"]["department"]
          frequency: Database["public"]["Enums"]["checklist_frequency"]
          id: string
          is_active: boolean
          last_generated_date: string | null
          specific_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          checklist_type: Database["public"]["Enums"]["checklist_type"]
          created_at?: string
          created_by?: string | null
          default_assigned_to?: string | null
          department: Database["public"]["Enums"]["department"]
          frequency?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          specific_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          checklist_type?: Database["public"]["Enums"]["checklist_type"]
          created_at?: string
          created_by?: string | null
          default_assigned_to?: string | null
          department?: Database["public"]["Enums"]["department"]
          frequency?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          specific_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          created_at: string
          department: Database["public"]["Enums"]["department"] | null
          email: string | null
          full_name: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department"] | null
          email?: string | null
          full_name?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department"] | null
          email?: string | null
          full_name?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      team_directory: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          department: Database["public"]["Enums"]["department"] | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          position: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          position?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          position?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "staff"
      assignment_periodicity:
        | "once"
        | "daily"
        | "weekly"
        | "biweekly"
        | "monthly"
      assignment_status: "active" | "paused" | "ended"
      checklist_frequency: "daily" | "weekly" | "monthly" | "determinate_date"
      checklist_status: "pending" | "completed" | "verified" | "rejected"
      checklist_type: "opening" | "afternoon" | "closing"
      department:
        | "management"
        | "kitchen"
        | "pizza"
        | "service"
        | "bar"
        | "office"
      photo_requirement: "none" | "optional" | "mandatory"
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
      app_role: ["owner", "manager", "staff"],
      assignment_periodicity: [
        "once",
        "daily",
        "weekly",
        "biweekly",
        "monthly",
      ],
      assignment_status: ["active", "paused", "ended"],
      checklist_frequency: ["daily", "weekly", "monthly", "determinate_date"],
      checklist_status: ["pending", "completed", "verified", "rejected"],
      checklist_type: ["opening", "afternoon", "closing"],
      department: [
        "management",
        "kitchen",
        "pizza",
        "service",
        "bar",
        "office",
      ],
      photo_requirement: ["none", "optional", "mandatory"],
    },
  },
} as const
