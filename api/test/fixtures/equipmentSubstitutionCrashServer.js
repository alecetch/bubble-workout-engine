// Child API used only by the interruption integration test. No server starts on import.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.env.CRASH_TEST_USER) {
  const { default: express } = await import('express');
  const { pool } = await import('../../src/db.js');
  const { createProgramDayActionHandlers } = await import('../../src/routes/programDayActions.js');
  const db = { query: pool.query.bind(pool), async connect() {
    const client = await pool.connect();
    return { release: () => client.release(), async query(sql,params) {
      const result = await client.query(sql,params);
      if (sql.includes('UPDATE program_exercise')) {
        process.send({ event:'first_swap' });
        await new Promise(() => {});
      }
      return result;
    } };
  } };
  const app = express(); app.use(express.json());
  app.post('/programs/:programId/equipment-substitution', (req,res) => {
    req.auth = { user_id:process.env.CRASH_TEST_USER };
    return createProgramDayActionHandlers(db).startEquipmentSubstitution(req,res);
  });
  const server = app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
}
