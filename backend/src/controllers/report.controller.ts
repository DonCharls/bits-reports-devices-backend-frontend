import { Request, Response } from 'express';
import { getAttendanceSummary } from '../services/report.service';

/**
 * GET /api/reports/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Returns pre-computed attendance summary rows for all active employees
 * plus the raw attendance records needed for the individual history modal.
 */
export const getAttendanceSummaryReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate query parameters are required (YYYY-MM-DD)',
      });
    }

    // Parse with PHT offset (+08:00) to match how attendance records are stored
    const start = new Date(`${String(startDate)}T00:00:00+08:00`);
    const end = new Date(`${String(endDate)}T23:59:59+08:00`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'startDate must not be after endDate.',
      });
    }

    const { summary, rawRecords } = await getAttendanceSummary(start, end);

    res.json({
      success: true,
      summary,
      rawRecords,
    });
  } catch (error: any) {
    console.error('[Reports] Failed to generate summary:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate attendance report',
    });
  }
};
