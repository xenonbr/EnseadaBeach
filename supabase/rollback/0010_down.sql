-- Reversão de 20261024000010_staff_tracking_and_ratings.sql
drop function if exists public.submit_service_rating(text, text, uuid, uuid, int, text, text);
drop function if exists public.get_ratable_closed_session(text, text);
drop table if exists public.service_ratings;
