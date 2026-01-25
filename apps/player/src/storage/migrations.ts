import fs from 'fs';
import path from 'path';
import pool from './db';
import logger from '../observability/logger';

export async function runMigrations() {
    const client = await pool.connect();
    try {
        logger.info('Running database migrations...');

        const migrationsDir = path.resolve(process.cwd(), 'apps/player/migrations');
        logger.info({ path: migrationsDir }, 'Loading migration directory');

        if (!fs.existsSync(migrationsDir)) {
            throw new Error(`Migrations directory not found at ${migrationsDir}`);
        }

        const files = fs
            .readdirSync(migrationsDir)
            .filter((file) => file.endsWith('.sql'))
            .sort((a, b) => a.localeCompare(b));

        if (files.length === 0) {
            logger.info({ path: migrationsDir }, 'No migration files found');
            return;
        }

        await client.query('BEGIN');
        for (const file of files) {
            const migrationFile = path.join(migrationsDir, file);
            logger.info({ path: migrationFile }, 'Running migration file');
            const sql = fs.readFileSync(migrationFile, 'utf8');
            await client.query(sql);
        }
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
