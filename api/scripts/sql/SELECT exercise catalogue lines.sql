SELECT pe.program_day_key,
       pe.order_in_day,
       pe.order_in_block,
       ec.*
FROM program_exercise pe
JOIN public.exercise_catalogue ec
  ON ec.exercise_id = pe.exercise_id
WHERE pe.program_id = (
    SELECT id FROM program ORDER BY created_at DESC LIMIT 1
)
AND pe.program_day_key = 'PD_W1_D1'
ORDER BY pe.order_in_day, pe.order_in_block
LIMIT 1000;