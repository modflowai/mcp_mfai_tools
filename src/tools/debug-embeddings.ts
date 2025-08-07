/**
 * Debug Embeddings - Quick tool to inspect embedding source text
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export async function debugEmbeddings(sql: NeonQueryFunction<false, false>) {
  try {
    // Check FloPy workflows - look for embedding source columns
    console.log('[DEBUG] Checking FloPy workflow columns...');
    const flopyColumns = await sql.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'flopy_workflows'
      ORDER BY ordinal_position
    `);
    
    console.log('[DEBUG] FloPy columns:', flopyColumns);

    // Get a few FloPy examples with potential embedding source text
    const flopyExamples = await sql.query(`
      SELECT title, description, workflow_purpose, 
             CASE WHEN embedding_text IS NOT NULL THEN LEFT(embedding_text, 200) ELSE 'NULL' END as embedding_text_sample
      FROM flopy_workflows 
      LIMIT 3
    `);
    
    console.log('[DEBUG] FloPy examples:', flopyExamples);

    // Check PyEMU workflows  
    console.log('[DEBUG] Checking PyEMU workflow columns...');
    const pyemuColumns = await sql.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'pyemu_workflows'
      ORDER BY ordinal_position
    `);
    
    console.log('[DEBUG] PyEMU columns:', pyemuColumns);

    // Get a few PyEMU examples
    const pyemuExamples = await sql.query(`
      SELECT title, description, workflow_purpose,
             CASE WHEN embedding_text IS NOT NULL THEN LEFT(embedding_text, 200) ELSE 'NULL' END as embedding_text_sample  
      FROM pyemu_workflows 
      LIMIT 3
    `);
    
    console.log('[DEBUG] PyEMU examples:', pyemuExamples);

    return {
      flopyColumns,
      flopyExamples, 
      pyemuColumns,
      pyemuExamples
    };

  } catch (error) {
    console.error('[DEBUG] Error:', error);
    throw error;
  }
}