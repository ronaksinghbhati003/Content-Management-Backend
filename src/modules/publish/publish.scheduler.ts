import cron, { ScheduledTask } from 'node-cron';
import { publishService } from './publish.service';
import logger from '../../config/logger';

let schedulerTask: ScheduledTask | null = null;

/**
 * Background publish scheduler.
 * Runs every 60 seconds and checks for scheduled publish jobs
 * whose scheduledAt time has passed.
 */
export function startPublishScheduler(): void {
    if (schedulerTask) {
        logger.warn('[PublishScheduler] Scheduler is already running');
        return;
    }

    logger.info('[PublishScheduler] Starting publish scheduler (every 60 seconds)...');

    schedulerTask = cron.schedule('* * * * *', async () => {
        try {
            const pendingJobs = await publishService.getPendingJobs();

            if (pendingJobs.length === 0) {
                return; // Nothing to do
            }

            logger.info(`[PublishScheduler] Found ${pendingJobs.length} pending job(s) to execute`);

            for (const job of pendingJobs) {
                try {
                    logger.info(`[PublishScheduler] Executing job ${job._id} → ${job.platforms.join(', ')}`);
                    await publishService.executePublishJob(job._id.toString());
                } catch (error: any) {
                    logger.error(`[PublishScheduler] Failed to execute job ${job._id}: ${error.message}`);
                }
            }
        } catch (error: any) {
            logger.error(`[PublishScheduler] Error checking for pending jobs: ${error.message}`);
        }
    });

    logger.info('[PublishScheduler] ✅ Scheduler started successfully');
}

/**
 * Stop the publish scheduler
 */
export function stopPublishScheduler(): void {
    if (schedulerTask) {
        schedulerTask.stop();
        schedulerTask = null;
        logger.info('[PublishScheduler] Scheduler stopped');
    }
}
