begin;

do $$
declare
  definition text;
  old_expression text := 'case when definition.group_type = ''removal'' then ''No '' || o.name when linked.id is null then o.name else linked.name end';
  new_expression text := 'case when linked.id is null then o.name else linked.name end';
begin
  select pg_get_functiondef('private.quote_modifier_choices(uuid,jsonb)'::regprocedure) into definition;
  if position('''group_type'', definition.group_type' in definition) = 0 then
    raise exception 'Apply 054_removal_modifiers.sql before 055_exact_modifier_names.sql';
  end if;
  if position(old_expression in definition) > 0 then
    execute replace(definition, old_expression, new_expression);
  elsif position(new_expression in definition) = 0 then
    raise exception 'Unexpected modifier quote implementation; cannot update option naming safely';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
