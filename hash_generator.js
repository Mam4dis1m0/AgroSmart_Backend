// hash_generator.js - versión general
const bcrypt = require('bcrypt');
const { Client } = require('pg');
require('dotenv').config();

async function generateMigration() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  await client.connect();

  // Trae solo usuarios sin hash bcrypt
  const { rows } = await client.query(`
    SELECT id, email, contrasena 
    FROM usuario 
    WHERE contrasena NOT LIKE '$2b$%'
    AND contrasena IS NOT NULL
    AND contrasena != ''
  `);

  console.log('='.repeat(90));
  console.log(`🔍 Encontrados ${rows.length} usuarios sin hashear\n`);
  console.log('='.repeat(90));
  console.log('\n📋 SCRIPT SQL (Copiar y ejecutar en Supabase):\n');

  for (const user of rows) {
    const hash = bcrypt.hashSync(user.contrasena, 10);
    console.log(`-- ${user.email}`);
    console.log(`UPDATE usuario SET contrasena = '${hash}' WHERE id = '${user.id}';\n`);
  }

  await client.end();
}

generateMigration();