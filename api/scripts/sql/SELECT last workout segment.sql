SELECT 
       program_day_key,
       segment_key,
       block_key,
       block_order,
       segment_order_in_block,
       segment_type,
       purpose,
       purpose_label,
       segment_title,
       segment_notes,
       rounds,
       score_type,
       primary_score_label,
       secondary_score_label,
       segment_scheme_json,
       segment_duration_seconds,
       segment_duration_mmss,
       created_at
FROM public.workout_segment
WHERE program_id = (
    SELECT id
    FROM program
    ORDER BY created_at DESC
    LIMIT 1
)
AND program_day_key = 'PD_W1_D1'
ORDER BY program_day_key
LIMIT 12;
