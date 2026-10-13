ALTER TABLE public.media_assets ADD COLUMN asset_key text;

UPDATE public.media_assets
SET asset_key = usage_scope || ':' || COALESCE(day_type, '') || ':' || COALESCE(focus_type, '') || ':' || image_key
WHERE asset_key IS NULL;

ALTER TABLE public.media_assets ALTER COLUMN asset_key SET NOT NULL;
CREATE UNIQUE INDEX media_assets_asset_key_key ON public.media_assets(asset_key);
ALTER TABLE public.media_assets ADD COLUMN promoted_at timestamptz;
