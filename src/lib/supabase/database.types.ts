export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: 'customer' | 'admin';
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: { id: string; full_name?: string; phone?: string | null; role?: Profile['role']; created_at?: string; updated_at?: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};