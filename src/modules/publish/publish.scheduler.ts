import cron, { ScheduledTask } from 'node-cron';
import { publishService } from './publish.service';
import PublishJob from './publish.schema';
import logger from '../../config/logger';

let schedulerTask: ScheduledTask | null = null;

/**
 * On startup: any job still in "publishing" state was interrupted by a server crash/restart.
 * Reset them to "failed" so the user can retry from the UI.
 */
async function resetInterruptedJobs(): Promise<void> {
    try {
        const result = await PublishJob.updateMany(
            { status: 'publishing' },
            {
                $set: {
                    status: 'failed',
                    'platformResults.$[elem].status': 'failed',
                    'platformResults.$[elem].error': 'Server restarted while publishing was in progress. Please retry.',
                },
            },
            { arrayFilters: [{ 'elem.status': 'publishing' }] }
        );
        if (result.modifiedCount > 0) {
            logger.warn(`[PublishScheduler] Reset ${result.modifiedCount} interrupted publish job(s) to "failed" state`);
        }
    } catch (err: any) {
        logger.error(`[PublishScheduler] Failed to reset interrupted jobs: ${err.message}`);
    }
}

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

    // Clean up any jobs that were mid-flight when the server last stopped
    resetInterruptedJobs();

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
