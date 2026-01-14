import fs from 'fs';
import path from 'path';
import pool from './db';
import logger from '../observability/logger';

export async function runMigrations() {
    const client = await pool.connect();
    try {
        logger.info('Running database migrations...');

        // Determine path to migrations directory based on runtime environment
        // In dev (ts-node), it's ../../migrations relative to src/storage
        // In prod (dist), it's ../../migrations relative to dist/storage if we copy it there
        // Or we can use absolute path from process.cwd()
        const migrationFile = path.resolve(process.cwd(), 'apps/player/migrations/001_initial.sql');

        logger.info({ path: migrationFile }, 'Reading migration file');

        if (!fs.existsSync(migrationFile)) {
            throw new Error(`Migration file not found at ${migrationFile}`);
        }

        const sql = fs.readFileSync(migrationFile, 'utf8');

        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');

        logger.info('Migrations completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err }, 'Migration failed');
        throw err;
    } finally {
        client.release();
    }
}
