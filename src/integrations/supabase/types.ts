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
      audit_log: {
        Row: {
          action: string
          created_at: string
          data: Json | null
          id: number
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          data?: Json | null
          id?: number
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          data?: Json | null
          id?: number
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          cost: number
          created_at: string
          id: string
          min_stock: number
          name: string
          notes: string | null
          stock: number
          supplier_id: string | null
          unit: Database["public"]["Enums"]["ingredient_unit"]
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          min_stock?: number
          name: string
          notes?: string | null
          stock?: number
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["ingredient_unit"]
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          min_stock?: number
          name?: string
          notes?: string | null
          stock?: number
          supplier_id?: string | null
          unit?: Database["public"]["Enums"]["ingredient_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          qty: number
          ready_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["item_status"]
          tax_rate: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          product_id: string
          product_name: string
          qty?: number
          ready_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          tax_rate?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          product_id?: string
          product_name?: string
          qty?: number
          ready_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          closed_at: string | null
          code: number
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax: number
          total: number
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          waiter_id: string | null
        }
        Insert: {
          closed_at?: string | null
          code?: number
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax?: number
          total?: number
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          waiter_id?: string | null
        }
        Update: {
          closed_at?: string | null
          code?: number
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax?: number
          total?: number
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          optional: boolean
          product_id: string
          quantity: number
          unit: Database["public"]["Enums"]["ingredient_unit"]
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          optional?: boolean
          product_id: string
          quantity?: number
          unit: Database["public"]["Enums"]["ingredient_unit"]
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          optional?: boolean
          product_id?: string
          quantity?: number
          unit?: Database["public"]["Enums"]["ingredient_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available: boolean
          category_id: string | null
          code: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          prep_time_minutes: number
          price: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          category_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          prep_time_minutes?: number
          price?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          category_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          prep_time_minutes?: number
          price?: number
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          created_at: string
          height: number
          id: string
          number: number
          pos_x: number
          pos_y: number
          seats: number
          shape: Database["public"]["Enums"]["table_shape"]
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
          width: number
        }
        Insert: {
          created_at?: string
          height?: number
          id?: string
          number: number
          pos_x?: number
          pos_y?: number
          seats?: number
          shape?: Database["public"]["Enums"]["table_shape"]
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
          width?: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          number?: number
          pos_x?: number
          pos_y?: number
          seats?: number
          shape?: Database["public"]["Enums"]["table_shape"]
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          note: string | null
          order_item_id: string | null
          qty: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          note?: string | null
          order_item_id?: string | null
          qty: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          note?: string | null
          order_item_id?: string | null
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_stock_for_item: {
        Args: { _item_id: string; _qty: number; _reverse: boolean }
        Returns: undefined
      }
      convert_unit: {
        Args: {
          _from: Database["public"]["Enums"]["ingredient_unit"]
          _qty: number
          _to: Database["public"]["Enums"]["ingredient_unit"]
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "encargado" | "mozo" | "caja" | "cocina"
      ingredient_unit: "g" | "kg" | "ml" | "l" | "u"
      item_status: "pending" | "preparing" | "ready" | "delivered" | "cancelled"
      order_status: "open" | "sent" | "paid" | "cancelled"
      order_type: "dine_in" | "takeaway" | "delivery"
      stock_movement_type: "sale" | "purchase" | "adjustment" | "return"
      table_shape: "square" | "round" | "rectangle"
      table_status: "free" | "occupied" | "reserved" | "cleaning"
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
      app_role: ["admin", "encargado", "mozo", "caja", "cocina"],
      ingredient_unit: ["g", "kg", "ml", "l", "u"],
      item_status: ["pending", "preparing", "ready", "delivered", "cancelled"],
      order_status: ["open", "sent", "paid", "cancelled"],
      order_type: ["dine_in", "takeaway", "delivery"],
      stock_movement_type: ["sale", "purchase", "adjustment", "return"],
      table_shape: ["square", "round", "rectangle"],
      table_status: ["free", "occupied", "reserved", "cleaning"],
    },
  },
} as const
