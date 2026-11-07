import { LOGO_MAX_BYTES, REPORT_MAX_BYTES } from '@nabd/shared';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from './errorHandler.js';

// Files are kept in memory only long enough to check their real type; nothing
// is written to disk before that check passes (see lib/uploads.ts).
const logoParser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
}).single('logo');

/** Parses a single "logo" file field and turns Multer errors into API errors. */
export const logoUpload: RequestHandler = (req, res, next) => {
  logoParser(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        error.code === 'LIMIT_FILE_SIZE'
          ? new HttpError(413, 'FILE_TOO_LARGE', error.message)
          : new HttpError(400, 'FILE_REQUIRED', error.message),
      );
      return;
    }
    if (error) {
      next(error);
      return;
    }
    if (!req.file) {
      next(new HttpError(400, 'FILE_REQUIRED', 'No "logo" file in the request'));
      return;
    }
    next();
  });
};

const reportParser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REPORT_MAX_BYTES, files: 1 },
}).single('file');

/**
 * An optional "file" field for a medical report or result (task 3.5): the
 * form may carry only written values.
 */
export const optionalReportUpload: RequestHandler = (req, res, next) => {
  reportParser(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        error.code === 'LIMIT_FILE_SIZE'
          ? new HttpError(413, 'FILE_TOO_LARGE', error.message)
          : new HttpError(400, 'VALIDATION_ERROR', error.message),
      );
      return;
    }
    next(error ?? undefined);
  });
};
