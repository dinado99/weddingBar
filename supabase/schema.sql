-- 픽셀 술장 청첩장 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 이 파일 내용을 그대로 붙여 넣고 Run 하면 된다.
--
-- 누가 무엇을 할 수 있나 (Row Level Security)
--   invitations : 누구나 읽기. 이메일로 로그인한 신랑·신부만 만들기, 자기 청첩장만 고치기·지우기.
--   entries     : 누구나 읽기(숨긴 술병은 신랑·신부와 쓴 사람만). 하객은 청첩장마다 한 병, 자기 것만 쓰고 고치기.
--   cheers      : 누구나 읽기. 하객은 자기 건배 횟수만 쓰기.
-- 하객은 익명 로그인(Anonymous sign-in)으로 자동 로그인된다.

create table if not exists public.invitations (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  groom         text not null check (char_length(groom) between 1 and 20),
  bride         text not null check (char_length(bride) between 1 and 20),
  wedding_date  date not null,
  wedding_time  time not null default '12:00',
  venue         text not null check (char_length(venue) between 1 and 60),
  address       text check (char_length(address) <= 120),
  groom_account text check (char_length(groom_account) <= 80),
  bride_account text check (char_length(bride_account) <= 80),
  greeting      text check (char_length(greeting) <= 300),
  favorite      text not null default 'wine',
  hidden        uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists public.entries (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  author_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  drink         text not null check (drink in ('soju','beer','makgeolli','wine','champagne','whisky','sake','cocktail')),
  color         text check (color ~ '^#[0-9a-fA-F]{6}$'),
  ribbon        boolean not null default false,
  capsule       boolean not null default false,
  nickname      text not null check (char_length(nickname) between 1 and 12),
  side          text not null check (side in ('groom','bride')),
  message       text not null check (char_length(message) between 1 and 300),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (invitation_id, author_id)
);

create table if not exists public.cheers (
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  author_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  count         integer not null default 0 check (count between 0 and 100000),
  primary key (invitation_id, author_id)
);

create index if not exists entries_invitation_idx on public.entries (invitation_id);
create index if not exists invitations_owner_idx on public.invitations (owner_id);

alter table public.invitations enable row level security;
alter table public.entries     enable row level security;
alter table public.cheers      enable row level security;

-- 익명 로그인이 아닌(이메일로 로그인한) 사용자인지
create or replace function public.is_email_user() returns boolean
language sql stable as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- invitations ---------------------------------------------------------------
drop policy if exists "누구나 청첩장 읽기" on public.invitations;
create policy "누구나 청첩장 읽기" on public.invitations
  for select using (true);

drop policy if exists "이메일 사용자만 청첩장 만들기" on public.invitations;
create policy "이메일 사용자만 청첩장 만들기" on public.invitations
  for insert to authenticated with check (owner_id = auth.uid() and public.is_email_user());

drop policy if exists "주인만 청첩장 고치기" on public.invitations;
create policy "주인만 청첩장 고치기" on public.invitations
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "주인만 청첩장 지우기" on public.invitations;
create policy "주인만 청첩장 지우기" on public.invitations
  for delete to authenticated using (owner_id = auth.uid());

-- entries -------------------------------------------------------------------
drop policy if exists "보이는 술병 읽기" on public.entries;
create policy "보이는 술병 읽기" on public.entries
  for select using (
    author_id = auth.uid()
    or exists (
      select 1 from public.invitations i
      where i.id = entries.invitation_id
        and (i.owner_id = auth.uid() or not (entries.id = any (i.hidden)))
    )
  );

drop policy if exists "하객은 자기 술 올리기" on public.entries;
create policy "하객은 자기 술 올리기" on public.entries
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "하객은 자기 술 고치기" on public.entries;
create policy "하객은 자기 술 고치기" on public.entries
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "쓴 사람이나 신랑신부가 술 지우기" on public.entries;
create policy "쓴 사람이나 신랑신부가 술 지우기" on public.entries
  for delete to authenticated using (
    author_id = auth.uid()
    or exists (select 1 from public.invitations i where i.id = entries.invitation_id and i.owner_id = auth.uid())
  );

-- cheers --------------------------------------------------------------------
drop policy if exists "누구나 건배 읽기" on public.cheers;
create policy "누구나 건배 읽기" on public.cheers
  for select using (true);

drop policy if exists "자기 건배 쓰기" on public.cheers;
create policy "자기 건배 쓰기" on public.cheers
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "자기 건배 고치기" on public.cheers;
create policy "자기 건배 고치기" on public.cheers
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

-- 권한과 실시간 -------------------------------------------------------------
grant select on public.invitations, public.entries, public.cheers to anon, authenticated;
grant insert, update, delete on public.invitations, public.entries, public.cheers to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.invitations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.entries;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.cheers;      exception when duplicate_object then null; end;
end $$;
