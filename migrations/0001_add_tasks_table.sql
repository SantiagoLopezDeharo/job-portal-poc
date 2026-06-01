create extension if not exists pgcrypto;

create table if not exists users (
    id text primary key,
    role text not null check (role in ('applicant', 'company')),
    username text not null,
    first_name text,
    last_name text,
    legal_name text,
    company_id text unique,
    cv_url text,
    match_score integer,
    profile jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists jobs (
    id uuid primary key default gen_random_uuid(),
    company_id text not null references users(id) on delete cascade,
    title text not null,
    description text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists applications (
    id uuid primary key default gen_random_uuid(),
    user_id text not null references users(id) on delete cascade,
    job_id uuid not null references jobs(id) on delete cascade,
    accepted boolean,
    match_score integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, job_id)
);

create table if not exists match_events (
    id uuid primary key default gen_random_uuid(),
    application_id uuid not null,
    user_id text not null,
    job_id uuid not null,
    status text not null default 'pending',
    created_at timestamptz not null default now()
);
