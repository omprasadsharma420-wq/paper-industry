create or replace function private.agra_guard_qc_checklist()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.result = 'PASSED'
     and new.product_category = 'HANDCRAFTED_DIARY'
     and not coalesce(new.checklist, '{}'::jsonb) @> jsonb_build_object(
       'pageCount', true,
       'dimensions', true,
       'binding', true,
       'coverFinish', true,
       'branding', true,
       'pagesClean', true,
       'damageFree', true
     ) then
    raise exception using
      errcode = '22023',
      message = 'Complete every diary quality check before recording a pass.';
  end if;

  return new;
end
$$;

revoke all on function private.agra_guard_qc_checklist() from public, anon, authenticated;

drop trigger if exists agra_guard_qc_checklist_before_write on public.agra_qc_inspections;
create trigger agra_guard_qc_checklist_before_write
before insert or update of result, checklist, product_category
on public.agra_qc_inspections
for each row
execute function private.agra_guard_qc_checklist();
