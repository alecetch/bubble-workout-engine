SELECT program_day_key,
segment_key,
segment_type,
exercise_name,
reps_prescribed,
       intensity_prescription,
       rest_seconds,
       is_loadable,
       order_in_block,
       order_in_day
FROM program_exercise
WHERE program_id = (
    SELECT id
    FROM program
    ORDER BY created_at DESC
    LIMIT 1
)
AND program_day_key = 'PD_W1_D1'
ORDER BY program_day_key
LIMIT 12;
