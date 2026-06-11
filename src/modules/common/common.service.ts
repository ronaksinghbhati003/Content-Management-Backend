import mongoose from 'mongoose';
import { NotFoundException, BadRequestException } from '../../shared/http-exception';

export class CommonService {
    /**
     * Perform a soft delete on any collection
     */
    async softDelete(collectionName: string, id: string): Promise<any> {
        try {
            // Get the model by name. Note: Mongoose model names are usually singular and capitalized (e.g., 'Content', 'Users')
            // But sometimes people use collection names. We'll try to find it.
            let model: mongoose.Model<any>;
            
            try {
                model = mongoose.model(collectionName);
            } catch (e) {
                // If not found by exact name, try to list all models and find a case-insensitive match or plural match
                const modelNames = mongoose.modelNames();
                const matchedName = modelNames.find(
                    name => name.toLowerCase() === collectionName.toLowerCase() || 
                           name.toLowerCase() === collectionName.toLowerCase().slice(0, -1)
                );
                
                if (!matchedName) {
                    throw new BadRequestException(`Model for collection '${collectionName}' not found`);
                }
                model = mongoose.model(matchedName);
            }

            const result = await model.findOneAndUpdate(
                { _id: new mongoose.Types.ObjectId(id), isDeleted: { $ne: true } },
                { $set: { isDeleted: true, deletedAt: new Date() } },
                { new: true }
            );

            if (!result) {
                throw new NotFoundException(`Resource with ID ${id} not found or already deleted in ${collectionName}`);
            }

            return result;
        } catch (error: any) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(error.message || 'Error performing soft delete');
        }
    }
}

export const commonService = new CommonService();
