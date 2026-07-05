import { Response } from 'express';
import { AuthRequest } from '../../middlewares/access-token.middleware';
import { commonService } from './common.service';
import { ApiResponse } from '../../shared/api-response';
import { asyncHandler } from '../../shared/async-handler';
import { SoftDeleteInput } from './common.z.schema';

export class CommonController {
    /**
     * @route POST /api/v1/common/soft-delete
     * @desc Generic soft delete for any collection
     */
    softDelete = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { collectionName, id }: SoftDeleteInput = req.body;

        const result = await commonService.softDelete(collectionName, id);

        res.status(200).json(ApiResponse.ok(null, `Resource in ${collectionName} softly deleted successfully`));
    });
}

export const commonController = new CommonController();
