import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadBuffer(
    buffer: Buffer,
    folder: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `diad/${folder}`,
            resource_type: 'image',
          },
          (error, result) => {
            if (error || !result) return reject(error);
            resolve(result);
          },
        )
        .end(buffer);
    });
  }

  async uploadRawBuffer(
    buffer: Buffer,
    folder: string,
    filename: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `diad/${folder}`,
            resource_type: 'raw',
            public_id: filename.replace(/\.[^.]+$/, ''),
          },
          (error, result) => {
            if (error || !result) return reject(error);
            resolve(result);
          },
        )
        .end(buffer);
    });
  }

  async deleteResource(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
