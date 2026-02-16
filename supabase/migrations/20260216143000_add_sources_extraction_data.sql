ALTER TABLE public.sources
ADD COLUMN IF NOT EXISTS extraction_data jsonb;
