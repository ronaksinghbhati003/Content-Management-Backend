import { Request, Response } from 'express';
import { HealthService } from './health.service';
import { ApiResponse } from '../../shared/api-response';

export class HealthController {
  private readonly healthService: HealthService;

  constructor(healthService: HealthService) {
    this.healthService = healthService;
  }

  /**
   * GET /health
   * Returns server health and system metrics.
   */
  getHealth = async (_req: Request, res: Response): Promise<void> => {
    const healthData = await this.healthService.getHealth();
    res.status(200).json(ApiResponse.ok(healthData, 'Server is healthy'));
  };
}
