ALTER TABLE hyrox_doubles_scraped_results
  DROP CONSTRAINT IF EXISTS hyrox_doubles_scraped_results_division_category_check;

ALTER TABLE hyrox_doubles_scraped_results
  ADD CONSTRAINT hyrox_doubles_scraped_results_division_category_check
  CHECK (division_category IN (
    'open_male',
    'open_female',
    'pro_male',
    'pro_female',
    'doubles_male',
    'doubles_female',
    'doubles_mixed',
    'pro_doubles_male',
    'pro_doubles_female',
    'pro_doubles_mixed',
    'team_relay_male',
    'team_relay_female',
    'team_relay_mixed'
  ));

ALTER TABLE hyrox_doubles_scrape_job_events
  DROP CONSTRAINT IF EXISTS hyrox_doubles_scrape_job_events_division_category_check;

ALTER TABLE hyrox_doubles_scrape_job_events
  ADD CONSTRAINT hyrox_doubles_scrape_job_events_division_category_check
  CHECK (division_category IN (
    'open_male',
    'open_female',
    'pro_male',
    'pro_female',
    'doubles_male',
    'doubles_female',
    'doubles_mixed',
    'pro_doubles_male',
    'pro_doubles_female',
    'pro_doubles_mixed',
    'team_relay_male',
    'team_relay_female',
    'team_relay_mixed'
  ));
