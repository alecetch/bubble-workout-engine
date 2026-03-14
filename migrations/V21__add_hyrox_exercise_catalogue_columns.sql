-- V21: Add Hyrox-specific metadata columns to exercise_catalogue.
-- hyrox_role: 'race_station' | 'carry' | 'run_buy_in' | 'accessory' | NULL
-- hyrox_station_index: 1–8 matching official Hyrox race station order
--   1=SkiErg, 2=SledPush, 3=SledPull, 4=BurpeeBroadJump,
--   5=RowErg, 6=FarmerCarry, 7=SandbagLunge, 8=Wallball

ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS hyrox_role VARCHAR(50),
  ADD COLUMN IF NOT EXISTS hyrox_station_index INTEGER;
