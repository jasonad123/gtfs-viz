

import JSZip from 'jszip';
import { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { logger } from '@/lib/logger';
import { importGtfs } from '@gtfs-viz/duckdb-extension';
import type { SqlExecutor } from '@gtfs-viz/duckdb-extension';

export interface GTFSFile {
  name: string;
  content: string;
  required: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  files: GTFSFile[];
  zip?: JSZip;
}

export interface IngestionProgress {
  percent: number;
  message: string;
  step: 'download' | 'extract' | 'validate' | 'register' | 'import' | 'reformat' | 'complete';
}

export type ProgressCallback = (progress: IngestionProgress) => void;

const REQUIRED_FILES = [
  'stops.txt',
] as const;

const USED_FILES = [
  'stops.txt',
  'pathways.txt',
] as const;

const OPTIONAL_FILES = [
  'routes.txt',
  'trips.txt',
  'stop_times.txt',
  'agency.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'shapes.txt',
  'frequencies.txt',
  'transfers.txt',
  'feed_info.txt',
] as const;

const ALL_GTFS_FILES = [...REQUIRED_FILES, ...OPTIONAL_FILES, 'pathways.txt'];

export async function validateGTFSZip(
  file: File,
  onProgress?: ProgressCallback
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: GTFSFile[] = [];

  try {
    onProgress?.({ percent: 0, message: 'Loading ZIP file...', step: 'validate' });

    const zip = await JSZip.loadAsync(file);
    const zipFiles = Object.keys(zip.files);

    onProgress?.({ percent: 30, message: 'Checking required files...', step: 'validate' });

    for (const requiredFile of REQUIRED_FILES) {
      const found = zipFiles.some(f => f.endsWith(requiredFile));
      if (!found) {
        errors.push(`Missing required file: ${requiredFile}`);
      }
    }

    onProgress?.({ percent: 60, message: 'Validating file structure...', step: 'validate' });

    for (const fileName of ALL_GTFS_FILES) {
      const zipEntry = Object.values(zip.files).find(f => f.name.endsWith(fileName));

      if (zipEntry && !zipEntry.dir) {
        files.push({
          name: fileName,
          content: '',
          required: REQUIRED_FILES.includes(fileName as any),
        });

        logger.log(`  Found ${fileName}`);
      }
    }

    onProgress?.({ percent: 100, message: 'Validation complete', step: 'validate' });

    return { valid: errors.length === 0, errors, warnings, files, zip };

  } catch (error) {
    errors.push(`Failed to read ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { valid: false, errors, warnings, files };
  }
}

export async function validateGTFSUrl(
  url: string,
  onProgress?: ProgressCallback
): Promise<ValidationResult> {
  try {
    onProgress?.({ percent: 0, message: 'Downloading GTFS feed...', step: 'download' });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    onProgress?.({ percent: 50, message: 'Download complete, validating...', step: 'extract' });

    const blob = await response.blob();
    const file = new File([blob], 'gtfs.zip', { type: 'application/zip' });

    return validateGTFSZip(file, onProgress);

  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to download URL: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: [],
      files: [],
    };
  }
}

export async function loadIngestionProcedures(
  _conn: AsyncDuckDBConnection
): Promise<void> {
  // Enum macros are loaded by installMacros() inside importGtfs() — no-op
}

export async function registerGTFSFiles(
  db: AsyncDuckDB,
  zip: JSZip,
  fileNames: string[],
  onProgress?: ProgressCallback
): Promise<void> {
  try {
    onProgress?.({ percent: 0, message: 'Registering files with DuckDB...', step: 'register' });

    const filesToRegister = fileNames.filter(name => USED_FILES.includes(name as any));

    logger.log(`Registering ${filesToRegister.length} files (skipping ${fileNames.length - filesToRegister.length} unused files)`);

    for (let i = 0; i < filesToRegister.length; i++) {
      const fileName = filesToRegister[i];
      const percent = ((i + 1) / filesToRegister.length) * 100;

      onProgress?.({
        percent,
        message: `Registering ${fileName}...`,
        step: 'register',
      });

      const zipEntry = Object.values(zip.files).find(f => f.name.endsWith(fileName));
      if (zipEntry && !zipEntry.dir) {
        const arrayBuffer = await zipEntry.async('arraybuffer');
        const uint8Array = new Uint8Array(arrayBuffer);

        await db.registerFileBuffer(fileName, uint8Array);

        const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
        logger.log(`  Registered ${fileName} (${sizeMB} MB)`);
      }
    }

    onProgress?.({ percent: 100, message: 'All files registered', step: 'register' });
  } catch (error) {
    logger.error('Failed to register files:', error);
    throw error;
  }
}

export async function runIngestion(
  conn: AsyncDuckDBConnection,
  skipReformat: boolean = false,
  onProgress?: ProgressCallback,
  hasPathwaysFile: boolean = false
): Promise<{ hasStations: boolean; hasStops: boolean }> {
  try {
    onProgress?.({ percent: 20, message: 'Importing and reformatting GTFS data...', step: 'import' });

    const executor: SqlExecutor = async (sql: string) => {
      await conn.query(sql);
    };

    // Use the extension's ingestion: macros → drop → import/reformat → init
    await importGtfs(executor, {
      stopsPath: 'stops.txt',
      pathwaysPath: hasPathwaysFile ? 'pathways.txt' : undefined,
    });

    onProgress?.({ percent: 90, message: 'Validating data...', step: 'complete' });

    const stopsResult = await conn.query(`SELECT COUNT(*) as count FROM stops WHERE location_type = 1`);
    const hasStations = stopsResult.toArray()[0]?.count > 0;

    const allStopsResult = await conn.query(`SELECT COUNT(*) as count FROM stops`);
    const hasStops = allStopsResult.toArray()[0]?.count > 0;

    logger.log(`Data imported: ${allStopsResult.toArray()[0]?.count} stops, ${hasStations ? 'includes stations' : 'no stations'}`);

    onProgress?.({ percent: 100, message: 'Ingestion complete!', step: 'complete' });

    return { hasStations, hasStops };

  } catch (error) {
    logger.error('Ingestion failed:', error);
    throw error;
  }
}

export async function ingestGTFS(
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
  source: File | string,
  options: {
    skipReformat?: boolean;
    onProgress?: ProgressCallback;
  } = {}
): Promise<{ hasStations: boolean; hasStops: boolean }> {
  const { skipReformat = false, onProgress } = options;

  try {
    onProgress?.({ percent: 0, message: 'Starting validation...', step: 'validate' });

    let validation: ValidationResult;
    if (typeof source === 'string') {
      validation = await validateGTFSUrl(source, onProgress);
    } else {
      validation = await validateGTFSZip(source, onProgress);
    }

    if (!validation.valid) {
      throw new Error(`Validation failed:\n${validation.errors.join('\n')}`);
    }

    if (validation.warnings.length > 0) {
      logger.log('Validation warnings:', validation.warnings);
    }

    if (!validation.zip) {
      throw new Error('ZIP file not available from validation');
    }

    onProgress?.({ percent: 10, message: 'Registering files...', step: 'register' });

    const fileNames = validation.files.map(f => f.name);
    await registerGTFSFiles(db, validation.zip, fileNames, onProgress);

    const hasPathwaysFile = validation.files.some(f => f.name === 'pathways.txt');

    const result = await runIngestion(conn, skipReformat, onProgress, hasPathwaysFile);

    return result;

  } catch (error) {
    logger.error('GTFS ingestion failed:', error);
    throw error;
  }
}
