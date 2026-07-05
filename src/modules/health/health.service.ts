import os from 'os';

interface HealthData {
  status: string;
  uptime: number;
  timestamp: string;
  memory: {
    heapUsed: string;
    heapTotal: string;
    rss: string;
    external: string;
  };
  system: {
    platform: string;
    cpus: number;
    totalMemory: string;
    freeMemory: string;
    loadAvg: number[];
  };
  environment: string;
}

export class HealthService {
  /**
   * Gather health and system metrics.
   */
  async getHealth(): Promise<HealthData> {
    const memUsage = process.memoryUsage();
    const formatBytes = (bytes: number): string =>
      `${(bytes / 1024 / 1024).toFixed(2)} MB`;

    return {
      status: 'healthy',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: formatBytes(memUsage.heapUsed),


        heapTotal: formatBytes(memUsage.heapTotal),
        rss: formatBytes(memUsage.rss),
        external: formatBytes(memUsage.external),
      },
      system: {
        platform: os.platform(),
        cpus: os.cpus().length,
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        loadAvg: os.loadavg(),
      },
      environment: process.env.NODE_ENV || 'development',
    };
  }
}
