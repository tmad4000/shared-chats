-- ============================================================
-- Row-Level Security policies for Shared Chats
-- Applied after Drizzle migrations create the base tables.
--
-- The app sets these transaction-local variables with withUserDb():
--   app.current_user_id
--   app.current_share_token
--   app.current_api_key_hash
-- ============================================================

create or replace function public.current_app_user_id() returns uuid as $$
begin
  return nullif(current_setting('app.current_user_id', true), '')::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$ language plpgsql stable;

create or replace function public.current_app_share_token() returns text as $$
begin
  return nullif(current_setting('app.current_share_token', true), '');
end;
$$ language plpgsql stable;

create or replace function public.current_app_api_key_hash() returns text as $$
begin
  return nullif(current_setting('app.current_api_key_hash', true), '');
end;
$$ language plpgsql stable;

-- ============================================================
-- chats
-- ============================================================
alter table public.chats enable row level security;
alter table public.chats force row level security;

drop policy if exists chats_select_access on public.chats;
create policy chats_select_access on public.chats
  for select using (
    owner_id = public.current_app_user_id()
    or exists (
      select 1
      from public.chat_members cm
      where cm.chat_id = chats.id
        and cm.user_id = public.current_app_user_id()
    )
    or exists (
      select 1
      from public.share_links sl
      where sl.chat_id = chats.id
        and sl.token = public.current_app_share_token()
        and sl.revoked_at is null
    )
  );

drop policy if exists chats_insert_owner on public.chats;
create policy chats_insert_owner on public.chats
  for insert with check (owner_id = public.current_app_user_id());

drop policy if exists chats_update_access on public.chats;
create policy chats_update_access on public.chats
  for update using (
    owner_id = public.current_app_user_id()
    or exists (
      select 1
      from public.chat_members cm
      where cm.chat_id = chats.id
        and cm.user_id = public.current_app_user_id()
    )
  )
  with check (
    owner_id = public.current_app_user_id()
    or exists (
      select 1
      from public.chat_members cm
      where cm.chat_id = chats.id
        and cm.user_id = public.current_app_user_id()
    )
  );

drop policy if exists chats_delete_owner on public.chats;
create policy chats_delete_owner on public.chats
  for delete using (owner_id = public.current_app_user_id());

-- ============================================================
-- messages
-- ============================================================
alter table public.messages enable row level security;
alter table public.messages force row level security;

drop policy if exists messages_select_chat_access on public.messages;
create policy messages_select_chat_access on public.messages
  for select using (
    exists (
      select 1
      from public.chats c
      where c.id = messages.chat_id
    )
  );

drop policy if exists messages_insert_chat_access on public.messages;
create policy messages_insert_chat_access on public.messages
  for insert with check (
    exists (
      select 1
      from public.chats c
      where c.id = messages.chat_id
    )
    and (
      (role = 'user' and author_id = public.current_app_user_id())
      or (role = 'assistant' and author_id is null)
    )
  );

-- ============================================================
-- share_links
-- ============================================================
alter table public.share_links enable row level security;
alter table public.share_links force row level security;

drop policy if exists share_links_select_owner_or_presented_token on public.share_links;
create policy share_links_select_owner_or_presented_token on public.share_links
  for select using (
    token = public.current_app_share_token()
    or created_by_id = public.current_app_user_id()
  );

drop policy if exists share_links_insert_owner on public.share_links;
create policy share_links_insert_owner on public.share_links
  for insert with check (
    created_by_id = public.current_app_user_id()
    and exists (
      select 1
      from public.chats c
      where c.id = share_links.chat_id
        and c.owner_id = public.current_app_user_id()
    )
  );

drop policy if exists share_links_update_owner on public.share_links;
create policy share_links_update_owner on public.share_links
  for update using (created_by_id = public.current_app_user_id())
  with check (created_by_id = public.current_app_user_id());

drop policy if exists share_links_delete_owner on public.share_links;
create policy share_links_delete_owner on public.share_links
  for delete using (created_by_id = public.current_app_user_id());

-- ============================================================
-- chat_members
-- ============================================================
alter table public.chat_members enable row level security;
alter table public.chat_members force row level security;

drop policy if exists chat_members_select_self_or_owner on public.chat_members;
create policy chat_members_select_self_or_owner on public.chat_members
  for select using (user_id = public.current_app_user_id());

drop policy if exists chat_members_insert_join_token on public.chat_members;
create policy chat_members_insert_join_token on public.chat_members
  for insert with check (
    user_id = public.current_app_user_id()
    and joined_via_token = public.current_app_share_token()
    and exists (
      select 1
      from public.share_links sl
      where sl.token = public.current_app_share_token()
        and sl.chat_id = chat_members.chat_id
        and sl.revoked_at is null
    )
  );

drop policy if exists chat_members_delete_self_or_owner on public.chat_members;
create policy chat_members_delete_self_or_owner on public.chat_members
  for delete using (user_id = public.current_app_user_id());

-- ============================================================
-- context_resources
-- ============================================================
alter table public.context_resources enable row level security;
alter table public.context_resources force row level security;

drop policy if exists context_resources_select_visible on public.context_resources;
create policy context_resources_select_visible on public.context_resources
  for select using (
    added_by_id = public.current_app_user_id()
    or (
      permission = 'shared'
      and exists (
        select 1
        from public.chats c
        where c.id = context_resources.chat_id
      )
    )
  );

drop policy if exists context_resources_insert_chat_access on public.context_resources;
create policy context_resources_insert_chat_access on public.context_resources
  for insert with check (
    added_by_id = public.current_app_user_id()
    and kind in ('text', 'file')
    and permission in ('private', 'shared')
    and size_bytes >= 0
    and size_bytes <= 102400
    and octet_length(content) <= 102400
    and exists (
      select 1
      from public.chats c
      where c.id = context_resources.chat_id
    )
  );

drop policy if exists context_resources_update_owner_or_chat_owner on public.context_resources;
create policy context_resources_update_owner_or_chat_owner on public.context_resources
  for update using (
    added_by_id = public.current_app_user_id()
    or exists (
      select 1
      from public.chats c
      where c.id = context_resources.chat_id
        and c.owner_id = public.current_app_user_id()
    )
  )
  with check (
    kind in ('text', 'file')
    and permission in ('private', 'shared')
    and size_bytes >= 0
    and size_bytes <= 102400
    and octet_length(content) <= 102400
    and (
      added_by_id = public.current_app_user_id()
      or exists (
        select 1
        from public.chats c
        where c.id = context_resources.chat_id
          and c.owner_id = public.current_app_user_id()
      )
    )
  );

drop policy if exists context_resources_delete_owner_or_chat_owner on public.context_resources;
create policy context_resources_delete_owner_or_chat_owner on public.context_resources
  for delete using (
    added_by_id = public.current_app_user_id()
    or exists (
      select 1
      from public.chats c
      where c.id = context_resources.chat_id
        and c.owner_id = public.current_app_user_id()
    )
  );

-- ============================================================
-- api_keys
-- ============================================================
alter table public.api_keys enable row level security;
alter table public.api_keys force row level security;

drop policy if exists api_keys_select_owner_or_presented_key on public.api_keys;
create policy api_keys_select_owner_or_presented_key on public.api_keys
  for select using (
    user_id = public.current_app_user_id()
    or hashed_key = public.current_app_api_key_hash()
  );

drop policy if exists api_keys_insert_owner on public.api_keys;
create policy api_keys_insert_owner on public.api_keys
  for insert with check (user_id = public.current_app_user_id());

drop policy if exists api_keys_update_owner on public.api_keys;
create policy api_keys_update_owner on public.api_keys
  for update using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

drop policy if exists api_keys_delete_owner on public.api_keys;
create policy api_keys_delete_owner on public.api_keys
  for delete using (user_id = public.current_app_user_id());
