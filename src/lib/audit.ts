import { createClient } from '@/lib/supabase/client';

interface AuditParams {
  action: string;
  tableName?: string;
  recordId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

export async function logAudit({
  action,
  tableName,
  recordId,
  oldValues,
  newValues,
}: AuditParams): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action,
      table_name: tableName ?? null,
      record_id: recordId ?? null,
      old_values: oldValues ?? null,
      new_values: newValues ?? null,
    });
  } catch {
    // Audit logging should never break the main flow
  }
}
