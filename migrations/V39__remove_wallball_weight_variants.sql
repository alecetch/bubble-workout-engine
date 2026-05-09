-- Remove weighted wallball variants from exercise_catalogue.
-- These should not exist as separate catalogue rows.

delete from exercise_catalogue
where exercise_id in ('wallball_6kg', 'wallball_9kg');
