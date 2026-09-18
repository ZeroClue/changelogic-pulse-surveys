-- pulse_owner is created by POSTGRES_USER (superuser, owns tables, runs migrations).
-- pulse_app is the non-owner runtime role: no BYPASSRLS, so row-level security always applies.
CREATE ROLE pulse_app LOGIN PASSWORD 'pulse_app' NOSUPERUSER NOCREATEDB NOCREATEROLE;
