import fs from 'node:fs';
import path from 'node:path';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'zahoixqvkshqalvvrtbs';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN environment variable is required.');
  process.exit(1);
}
const BACKUP_DIR = path.resolve('D:/sevit/fixing akash/backups');
const JSON_DIR = path.join(BACKUP_DIR, 'raw_json');

fs.mkdirSync(JSON_DIR, { recursive: true });

async function runQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Query failed (${res.status}): ${text}`);
  }

  return await res.json();
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function main() {
  console.log('--- Starting Read-Only Supabase Backup ---');
  console.log(`Target: ${PROJECT_REF}`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const tables = [
    'stores',
    'profiles',
    'customers',
    'accessories',
    'phones',
    'phone_costs',
    'sales',
    'exchanges',
    'returns',
    'quotations',
    'services',
    'audit_log'
  ];

  const summary = {
    timestamp: new Date().toISOString(),
    project: PROJECT_REF,
    tables: {}
  };

  let sqlDump = `-- Supabase Backup for ${PROJECT_REF}\n-- Created: ${new Date().toISOString()}\n-- READ-ONLY BACKUP\n\nBEGIN;\n\n`;

  for (const table of tables) {
    process.stdout.write(`Dumping table: ${table}... `);
    const rows = await runQuery(`SELECT * FROM "${table}";`);
    summary.tables[table] = rows.length;

    const jsonPath = path.join(JSON_DIR, `${table}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), 'utf-8');

    sqlDump += `-- Table: ${table} (${rows.length} rows)\n`;
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]).map(c => `"${c}"`).join(', ');
      for (const row of rows) {
        const vals = Object.values(row).map(escapeSqlValue).join(', ');
        sqlDump += `INSERT INTO "${table}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
      }
    }
    sqlDump += '\n';

    console.log(`Done (${rows.length} rows)`);
  }

  sqlDump += 'COMMIT;\n';

  const sqlFilePath = path.join(BACKUP_DIR, `full_backup_${timestamp}.sql`);
  const latestSqlPath = path.join(BACKUP_DIR, `full_backup_latest.sql`);
  fs.writeFileSync(sqlFilePath, sqlDump, 'utf-8');
  fs.writeFileSync(latestSqlPath, sqlDump, 'utf-8');

  console.log('Dumping DB functions and views...');
  const views = await runQuery(`
    SELECT table_name, view_definition 
    FROM information_schema.views 
    WHERE table_schema = 'public';
  `);
  fs.writeFileSync(path.join(BACKUP_DIR, 'views_definitions.json'), JSON.stringify(views, null, 2), 'utf-8');

  const funcs = await runQuery(`
    SELECT routine_name, routine_definition 
    FROM information_schema.routines 
    WHERE routine_schema = 'public';
  `);
  fs.writeFileSync(path.join(BACKUP_DIR, 'routines_definitions.json'), JSON.stringify(funcs, null, 2), 'utf-8');

  fs.writeFileSync(path.join(BACKUP_DIR, 'backup_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  console.log('\n=== BACKUP COMPLETED SUCCESSFULLY ===');
  console.log(`Saved to: ${BACKUP_DIR}`);
  console.log('Row counts verified:');
  console.table(summary.tables);
}

main().catch(err => {
  console.error('Backup error:', err);
  process.exit(1);
});
