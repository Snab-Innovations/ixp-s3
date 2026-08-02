import { query } from '../api-server/db/pool.js';

const r = await query(
  `SELECT id,
          feedback IS NOT NULL AS has_feedback,
          length(coalesce(feedback,'')) AS feedback_len,
          left(coalesce(feedback,''), 800) AS feedback_head,
          candidate_info,
          raw
   FROM interview_attempts
   WHERE id = $1`,
  ['afe5f7d27a78c55cfc16f09a']
);
console.log(JSON.stringify(r.rows[0], null, 2));
process.exit(0);
