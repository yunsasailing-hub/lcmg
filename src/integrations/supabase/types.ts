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
          template_id: string | null
          updated_at: string
          warning_recipient_user_ids: string[]
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
          template_id?: string | null
          updated_at?: string
          warning_recipient_user_ids?: string[]
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
          template_id?: string | null
          updated_at?: string
          warning_recipient_user_ids?: string[]
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
      checklist_instance_tasks: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          instruction: string | null
          is_active: boolean
          note_required: boolean
          photo_required: boolean
          sort_order: number
          template_task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          instruction?: string | null
          is_active?: boolean
          note_required?: boolean
          photo_required?: boolean
          sort_order?: number
          template_task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          instruction?: string | null
          is_active?: boolean
          note_required?: boolean
          photo_required?: boolean
          sort_order?: number
          template_task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_instance_tasks_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "checklist_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_instance_tasks_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_instances: {
        Row: {
          assigned_manager_user_id: string | null
          assigned_to: string | null
          assignment_id: string | null
          branch_id: string | null
          checklist_type: Database["public"]["Enums"]["checklist_type"]
          completed_at: string | null
          created_at: string
          department: Database["public"]["Enums"]["department"]
          due_datetime: string | null
          id: string
          manually_locked: boolean
          notes: string | null
          notice_sent_at: string | null
          rejection_note: string | null
          scheduled_date: string
          status: Database["public"]["Enums"]["checklist_status"]
          submitted_at: string | null
          template_id: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          warning_recipient_user_ids: string[]
          warning_sent_at: string | null
        }
        Insert: {
          assigned_manager_user_id?: string | null
          assigned_to?: string | null
          assignment_id?: string | null
          branch_id?: string | null
          checklist_type: Database["public"]["Enums"]["checklist_type"]
          completed_at?: string | null
          created_at?: string
          department: Database["public"]["Enums"]["department"]
          due_datetime?: string | null
          id?: string
          manually_locked?: boolean
          notes?: string | null
          notice_sent_at?: string | null
          rejection_note?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          warning_recipient_user_ids?: string[]
          warning_sent_at?: string | null
        }
        Update: {
          assigned_manager_user_id?: string | null
          assigned_to?: string | null
          assignment_id?: string | null
          branch_id?: string | null
          checklist_type?: Database["public"]["Enums"]["checklist_type"]
          completed_at?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department"]
          due_datetime?: string | null
          id?: string
          manually_locked?: boolean
          notes?: string | null
          notice_sent_at?: string | null
          rejection_note?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["checklist_status"]
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          warning_recipient_user_ids?: string[]
          warning_sent_at?: string | null
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
          is_active: boolean
          note_requirement: Database["public"]["Enums"]["note_requirement"]
          photo_requirement: Database["public"]["Enums"]["photo_requirement"]
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          note_requirement?: Database["public"]["Enums"]["note_requirement"]
          photo_requirement?: Database["public"]["Enums"]["photo_requirement"]
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          note_requirement?: Database["public"]["Enums"]["note_requirement"]
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
          code: string | null
          created_at: string
          created_by: string | null
          default_assigned_to: string | null
          default_due_time: string
          department: Database["public"]["Enums"]["department"]
          frequency: Database["public"]["Enums"]["checklist_frequency"]
          id: string
          is_active: boolean
          last_generated_date: string | null
          specific_date: string | null
          title: string
          updated_at: string
          warning_recipient_user_ids: string[]
        }
        Insert: {
          branch_id?: string | null
          checklist_type: Database["public"]["Enums"]["checklist_type"]
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_assigned_to?: string | null
          default_due_time: string
          department: Database["public"]["Enums"]["department"]
          frequency?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          specific_date?: string | null
          title: string
          updated_at?: string
          warning_recipient_user_ids?: string[]
        }
        Update: {
          branch_id?: string | null
          checklist_type?: Database["public"]["Enums"]["checklist_type"]
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_assigned_to?: string | null
          default_due_time?: string
          department?: Database["public"]["Enums"]["department"]
          frequency?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          specific_date?: string | null
          title?: string
          updated_at?: string
          warning_recipient_user_ids?: string[]
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
      in_app_notifications: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          instance_id: string | null
          is_read: boolean
          message: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          priority: Database["public"]["Enums"]["notification_priority"]
          read_at: string | null
          related_entity_type: string
          related_module: string
          sender_type: string
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          is_read?: boolean
          message: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          related_entity_type?: string
          related_module?: string
          sender_type?: string
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          instance_id?: string | null
          is_read?: boolean
          message?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          priority?: Database["public"]["Enums"]["notification_priority"]
          read_at?: string | null
          related_entity_type?: string
          related_module?: string
          sender_type?: string
          status?: Database["public"]["Enums"]["notification_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "checklist_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_branches: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          ingredient_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          ingredient_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          ingredient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_branches_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_vi: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ingredient_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_vi: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          allergens: string[] | null
          base_unit_id: string | null
          category_id: string | null
          code: string | null
          cost_updated_at: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          departments: Database["public"]["Enums"]["department"][]
          id: string
          ingredient_category_id: string | null
          ingredient_type: Database["public"]["Enums"]["ingredient_type"]
          ingredient_type_id: string | null
          is_active: boolean
          is_global: boolean
          last_purchase_price: number | null
          name_en: string
          name_vi: string | null
          notes: string | null
          price: number | null
          purchase_to_base_factor: number
          purchase_unit_id: string | null
          storage_type: Database["public"]["Enums"]["storage_type"]
          storehouse_id: string | null
          supplier: string | null
          tax_rate: number
          updated_at: string
          updated_by: string | null
          yield_percent: number
        }
        Insert: {
          allergens?: string[] | null
          base_unit_id?: string | null
          category_id?: string | null
          code?: string | null
          cost_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          departments?: Database["public"]["Enums"]["department"][]
          id?: string
          ingredient_category_id?: string | null
          ingredient_type?: Database["public"]["Enums"]["ingredient_type"]
          ingredient_type_id?: string | null
          is_active?: boolean
          is_global?: boolean
          last_purchase_price?: number | null
          name_en: string
          name_vi?: string | null
          notes?: string | null
          price?: number | null
          purchase_to_base_factor?: number
          purchase_unit_id?: string | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          storehouse_id?: string | null
          supplier?: string | null
          tax_rate?: number
          updated_at?: string
          updated_by?: string | null
          yield_percent?: number
        }
        Update: {
          allergens?: string[] | null
          base_unit_id?: string | null
          category_id?: string | null
          code?: string | null
          cost_updated_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          departments?: Database["public"]["Enums"]["department"][]
          id?: string
          ingredient_category_id?: string | null
          ingredient_type?: Database["public"]["Enums"]["ingredient_type"]
          ingredient_type_id?: string | null
          is_active?: boolean
          is_global?: boolean
          last_purchase_price?: number | null
          name_en?: string
          name_vi?: string | null
          notes?: string | null
          price?: number | null
          purchase_to_base_factor?: number
          purchase_unit_id?: string | null
          storage_type?: Database["public"]["Enums"]["storage_type"]
          storehouse_id?: string | null
          supplier?: string | null
          tax_rate?: number
          updated_at?: string
          updated_by?: string | null
          yield_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "recipe_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "recipe_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_ingredient_category_id_fkey"
            columns: ["ingredient_category_id"]
            isOneToOne: false
            referencedRelation: "ingredient_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_ingredient_type_id_fkey"
            columns: ["ingredient_type_id"]
            isOneToOne: false
            referencedRelation: "ingredient_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "recipe_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_storehouse_id_fkey"
            columns: ["storehouse_id"]
            isOneToOne: false
            referencedRelation: "storehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          checklist_notices_enabled: boolean
          checklist_warnings_enabled: boolean
          created_at: string
          id: string
          notice_delay_hours: number
          push_enabled: boolean
          updated_at: string
          warning_delay_hours: number
          whatsapp_enabled: boolean
        }
        Insert: {
          checklist_notices_enabled?: boolean
          checklist_warnings_enabled?: boolean
          created_at?: string
          id?: string
          notice_delay_hours?: number
          push_enabled?: boolean
          updated_at?: string
          warning_delay_hours?: number
          whatsapp_enabled?: boolean
        }
        Update: {
          checklist_notices_enabled?: boolean
          checklist_warnings_enabled?: boolean
          created_at?: string
          id?: string
          notice_delay_hours?: number
          push_enabled?: boolean
          updated_at?: string
          warning_delay_hours?: number
          whatsapp_enabled?: boolean
        }
        Relationships: []
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
      recipe_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_vi: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      recipe_costs: {
        Row: {
          calculated_at: string
          cost_per_yield_unit: number
          currency: string
          details: Json | null
          id: string
          recipe_id: string
          total_cost: number
        }
        Insert: {
          calculated_at?: string
          cost_per_yield_unit?: number
          currency?: string
          details?: Json | null
          id?: string
          recipe_id: string
          total_cost?: number
        }
        Update: {
          calculated_at?: string
          cost_per_yield_unit?: number
          currency?: string
          details?: Json | null
          id?: string
          recipe_id?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_costs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_import_logs: {
        Row: {
          created_at: string
          details: Json | null
          entity: string
          error_rows: number
          id: string
          operation: string
          performed_by: string | null
          success_rows: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          details?: Json | null
          entity: string
          error_rows?: number
          id?: string
          operation: string
          performed_by?: string | null
          success_rows?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          details?: Json | null
          entity?: string
          error_rows?: number
          id?: string
          operation?: string
          performed_by?: string | null
          success_rows?: number
          total_rows?: number
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          cost_adjust_pct: number
          created_at: string
          id: string
          ingredient_id: string | null
          prep_note: string | null
          quantity: number
          recipe_id: string
          sort_order: number
          sub_recipe_id: string | null
          unit_id: string | null
        }
        Insert: {
          cost_adjust_pct?: number
          created_at?: string
          id?: string
          ingredient_id?: string | null
          prep_note?: string | null
          quantity?: number
          recipe_id: string
          sort_order?: number
          sub_recipe_id?: string | null
          unit_id?: string | null
        }
        Update: {
          cost_adjust_pct?: number
          created_at?: string
          id?: string
          ingredient_id?: string | null
          prep_note?: string | null
          quantity?: number
          recipe_id?: string
          sort_order?: number
          sub_recipe_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_sub_recipe_id_fkey"
            columns: ["sub_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "recipe_units"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_media: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_primary: boolean
          media_type: Database["public"]["Enums"]["recipe_media_type"]
          recipe_id: string
          sort_order: number
          storage_path: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          media_type: Database["public"]["Enums"]["recipe_media_type"]
          recipe_id: string
          sort_order?: number
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_primary?: boolean
          media_type?: Database["public"]["Enums"]["recipe_media_type"]
          recipe_id?: string
          sort_order?: number
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_media_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_procedure_media: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["recipe_media_kind"]
          procedure_id: string
          sort_order: number
          storage_path: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["recipe_media_kind"]
          procedure_id: string
          sort_order?: number
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["recipe_media_kind"]
          procedure_id?: string
          sort_order?: number
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_procedure_media_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "recipe_procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_procedures: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          image_storage_path: string | null
          image_url: string | null
          instruction_en: string
          instruction_vi: string | null
          note: string | null
          procedure_type: Database["public"]["Enums"]["procedure_type"]
          recipe_id: string
          step_number: number
          temperature: string | null
          tool: string | null
          video_url: string | null
          warning: string | null
          web_link: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          instruction_en: string
          instruction_vi?: string | null
          note?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"]
          recipe_id: string
          step_number: number
          temperature?: string | null
          tool?: string | null
          video_url?: string | null
          warning?: string | null
          web_link?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          instruction_en?: string
          instruction_vi?: string | null
          note?: string | null
          procedure_type?: Database["public"]["Enums"]["procedure_type"]
          recipe_id?: string
          step_number?: number
          temperature?: string | null
          tool?: string | null
          video_url?: string | null
          warning?: string | null
          web_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_procedures_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_service_info: {
        Row: {
          allergens_to_mention: string | null
          created_at: string
          created_by: string | null
          id: string
          image_storage_path: string | null
          image_url: string | null
          key_ingredients: string | null
          pairing_suggestion: string | null
          recipe_id: string
          service_warning: string | null
          short_description: string | null
          staff_explanation: string | null
          taste_profile: string | null
          updated_at: string
          updated_by: string | null
          upselling_notes: string | null
          video_url: string | null
          web_link: string | null
        }
        Insert: {
          allergens_to_mention?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          key_ingredients?: string | null
          pairing_suggestion?: string | null
          recipe_id: string
          service_warning?: string | null
          short_description?: string | null
          staff_explanation?: string | null
          taste_profile?: string | null
          updated_at?: string
          updated_by?: string | null
          upselling_notes?: string | null
          video_url?: string | null
          web_link?: string | null
        }
        Update: {
          allergens_to_mention?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          key_ingredients?: string | null
          pairing_suggestion?: string | null
          recipe_id?: string
          service_warning?: string | null
          short_description?: string | null
          staff_explanation?: string | null
          taste_profile?: string | null
          updated_at?: string
          updated_by?: string | null
          upselling_notes?: string | null
          video_url?: string | null
          web_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_service_info_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_service_media: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["recipe_media_kind"]
          recipe_id: string
          sort_order: number
          storage_path: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["recipe_media_kind"]
          recipe_id: string
          sort_order?: number
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["recipe_media_kind"]
          recipe_id?: string
          sort_order?: number
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_service_media_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_vi: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_vi?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      recipe_units: {
        Row: {
          base_unit_code: string | null
          code: string
          created_at: string
          factor_to_base: number
          id: string
          is_active: boolean
          name_en: string
          name_vi: string | null
          sort_order: number
          unit_type: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          base_unit_code?: string | null
          code: string
          created_at?: string
          factor_to_base?: number
          id?: string
          is_active?: boolean
          name_en: string
          name_vi?: string | null
          sort_order?: number
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          base_unit_code?: string | null
          code?: string
          created_at?: string
          factor_to_base?: number
          id?: string
          is_active?: boolean
          name_en?: string
          name_vi?: string | null
          sort_order?: number
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          branch_id: string | null
          category_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          department: Database["public"]["Enums"]["department"] | null
          description: string | null
          id: string
          internal_memo: string | null
          is_active: boolean
          kind: Database["public"]["Enums"]["recipe_kind"]
          name_en: string
          name_vi: string | null
          notes: string | null
          portion_quantity: number | null
          portion_unit: string | null
          recipe_type_id: string | null
          selling_price: number | null
          shelf_life: string | null
          status: Database["public"]["Enums"]["recipe_status"]
          updated_at: string
          updated_by: string | null
          use_as_ingredient: boolean
          yield_quantity: number | null
          yield_unit_id: string | null
        }
        Insert: {
          branch_id?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          id?: string
          internal_memo?: string | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["recipe_kind"]
          name_en: string
          name_vi?: string | null
          notes?: string | null
          portion_quantity?: number | null
          portion_unit?: string | null
          recipe_type_id?: string | null
          selling_price?: number | null
          shelf_life?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          updated_at?: string
          updated_by?: string | null
          use_as_ingredient?: boolean
          yield_quantity?: number | null
          yield_unit_id?: string | null
        }
        Update: {
          branch_id?: string | null
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          id?: string
          internal_memo?: string | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["recipe_kind"]
          name_en?: string
          name_vi?: string | null
          notes?: string | null
          portion_quantity?: number | null
          portion_unit?: string | null
          recipe_type_id?: string | null
          selling_price?: number | null
          shelf_life?: string | null
          status?: Database["public"]["Enums"]["recipe_status"]
          updated_at?: string
          updated_by?: string | null
          use_as_ingredient?: boolean
          yield_quantity?: number | null
          yield_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "recipe_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_recipe_type_id_fkey"
            columns: ["recipe_type_id"]
            isOneToOne: false
            referencedRelation: "recipe_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_yield_unit_id_fkey"
            columns: ["yield_unit_id"]
            isOneToOne: false
            referencedRelation: "recipe_units"
            referencedColumns: ["id"]
          },
        ]
      }
      storehouses: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
      cleanup_orphan_pending_checklists: { Args: never; Returns: Json }
      cleanup_pending_for_assignment: {
        Args: { _assignment_id: string }
        Returns: Json
      }
      create_checklist_instance_tasks: {
        Args: { _instance_id: string }
        Returns: undefined
      }
      current_user_department: {
        Args: never
        Returns: Database["public"]["Enums"]["department"]
      }
      delete_checklist_template: {
        Args: { _template_id: string }
        Returns: Json
      }
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
      checklist_status:
        | "pending"
        | "completed"
        | "verified"
        | "rejected"
        | "late"
        | "escalated"
      checklist_type: "opening" | "afternoon" | "closing"
      currency_code: "VND" | "USD" | "EUR"
      department:
        | "management"
        | "kitchen"
        | "pizza"
        | "service"
        | "bar"
        | "office"
        | "bakery"
      ingredient_type: "batch_recipe" | "bottled_drink" | "ingredient" | "other"
      note_requirement: "none" | "optional" | "mandatory"
      notification_priority: "normal" | "high" | "critical"
      notification_status: "unread" | "read" | "archived"
      notification_type: "notice" | "warning" | "escalation"
      photo_requirement: "none" | "optional" | "mandatory"
      procedure_type:
        | "prep"
        | "cook"
        | "assemble"
        | "bake"
        | "mix"
        | "finish"
        | "service_prep"
        | "other"
      recipe_kind: "dish" | "prep" | "batch" | "sub_recipe"
      recipe_media_kind: "image" | "video"
      recipe_media_type: "image" | "video_link" | "web_link" | "file"
      recipe_status: "draft" | "active" | "archived"
      storage_type: "dry" | "chilled" | "frozen" | "ambient"
      unit_type: "weight" | "volume" | "count" | "other"
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
      checklist_status: [
        "pending",
        "completed",
        "verified",
        "rejected",
        "late",
        "escalated",
      ],
      checklist_type: ["opening", "afternoon", "closing"],
      currency_code: ["VND", "USD", "EUR"],
      department: [
        "management",
        "kitchen",
        "pizza",
        "service",
        "bar",
        "office",
        "bakery",
      ],
      ingredient_type: ["batch_recipe", "bottled_drink", "ingredient", "other"],
      note_requirement: ["none", "optional", "mandatory"],
      notification_priority: ["normal", "high", "critical"],
      notification_status: ["unread", "read", "archived"],
      notification_type: ["notice", "warning", "escalation"],
      photo_requirement: ["none", "optional", "mandatory"],
      procedure_type: [
        "prep",
        "cook",
        "assemble",
        "bake",
        "mix",
        "finish",
        "service_prep",
        "other",
      ],
      recipe_kind: ["dish", "prep", "batch", "sub_recipe"],
      recipe_media_kind: ["image", "video"],
      recipe_media_type: ["image", "video_link", "web_link", "file"],
      recipe_status: ["draft", "active", "archived"],
      storage_type: ["dry", "chilled", "frozen", "ambient"],
      unit_type: ["weight", "volume", "count", "other"],
    },
  },
} as const
